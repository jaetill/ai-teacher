// POST /api/lesson-templates/derive — propose a template from the teacher's
// own lessons (#647).
//
// The alternative was a blank form, which asks the person who has already
// written a year of lessons to describe, from memory, how she writes lessons.
// This reads a sample of what she actually has and answers with "here's the
// structure you appear to use" — she edits and saves it. Recognition beats
// recall, and the blank-page problem disappears.
//
// Read-only by design: this NEVER writes to her curriculum. It returns a
// proposal; POST /api/lesson-templates is what persists one, after she has
// looked at it.
//
// Body: { courseId? } — scope to one course, or sample across all of hers.

import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { db } from "@/db";
import { lessons, units, courses } from "@/db/schema";
import { and, eq, desc } from "drizzle-orm";
import { getAnthropic } from "@/lib/anthropic";
import { checkAiRateLimit } from "@/lib/rate-limit";
import { MODELS } from "@/lib/models";
import { parseAiJson } from "@/lib/parse-ai-json";
import { isUuid, readJson } from "@/lib/api-utils";
import { normalizeFields, STARTER_FIELDS, MAX_FIELDS } from "@/lib/lesson-template";
import { apiError } from "@/lib/error-log";

const ROUTE = "/api/lesson-templates/derive";

/** Enough lessons to see a pattern, few enough to stay one cheap call. */
const SAMPLE_SIZE = 25;
/** Below this there's no pattern to find — offer the starter instead. */
const MIN_SAMPLE = 3;

const SYSTEM = `You analyse a teacher's existing lesson plans and describe the structure she already uses.

You are NOT inventing a best-practice lesson format. You are reporting the shape her own lessons already have, so she can confirm it. Prefer her vocabulary over standard pedagogical terms: if her lessons say "Do Now", the field is "Do Now", not "Warm-up".

Rules:
- Return between 3 and 8 fields. Fewer is better than padding with fields that appear once.
- Order them the way they occur in her lessons.
- type "list" for anything that reads as a sequence of steps or items; "text" for a single block of prose.
- required: true only when the field appears in nearly every lesson sampled.
- aiHint: one short sentence describing what belongs in that field, phrased for whoever writes the next lesson.

Return ONLY JSON, no prose, no code fences:
{
  "fields": [
    {"label": "Do Now", "type": "text", "required": true, "aiHint": "Short opener students start on arrival."}
  ],
  "notes": "One sentence on how consistent the sample was."
}`;

export async function POST(req: Request) {
  const session = await getServerSession(authOptions);
  const ownerEmail = session?.user?.email;
  if (!ownerEmail) {
    return Response.json({ error: "Not authenticated" }, { status: 401 });
  }

  const body = (await readJson<{ courseId?: string }>(req)) ?? {};
  if (body.courseId !== undefined && !isUuid(body.courseId)) {
    return Response.json({ error: "Invalid courseId" }, { status: 400 });
  }

  // Cheap validation first, then the rate-limit gate, then any AI spend.
  const rateLimited = await checkAiRateLimit(ownerEmail);
  if (rateLimited) return rateLimited;

  // Owner-scoped through unit → course. Newest first: her recent lessons
  // represent how she writes now better than her oldest ones do.
  const sample = await db
    .select({
      title: lessons.title,
      objectives: lessons.objectives,
      lessonPlan: lessons.lessonPlan,
      unitTitle: units.title,
    })
    .from(lessons)
    .innerJoin(units, eq(lessons.unitId, units.id))
    .innerJoin(courses, eq(units.courseId, courses.id))
    .where(
      body.courseId
        ? and(eq(courses.ownerEmail, ownerEmail), eq(courses.id, body.courseId))
        : eq(courses.ownerEmail, ownerEmail),
    )
    .orderBy(desc(lessons.updatedAt))
    .limit(SAMPLE_SIZE);

  if (sample.length < MIN_SAMPLE) {
    // Not enough to find a pattern in — say so plainly and offer the starter
    // rather than dressing up a guess as analysis.
    return Response.json({
      fields: STARTER_FIELDS,
      sampled: sample.length,
      derived: false,
      notes:
        sample.length === 0
          ? "No lessons to read yet, so this is a conventional starting point — edit it freely."
          : `Only ${sample.length} lesson(s) to read, which isn't enough to spot a pattern. This is a conventional starting point instead.`,
    });
  }

  const digest = sample
    .map((l, i) => {
      const plan =
        l.lessonPlan && typeof l.lessonPlan === "object" ? (l.lessonPlan as object) : {};
      return [
        `Lesson ${i + 1} (unit: ${l.unitTitle})`,
        `title: ${l.title}`,
        l.objectives?.length ? `objectives: ${l.objectives.join(" | ")}` : null,
        `plan: ${JSON.stringify(plan).slice(0, 1200)}`,
      ]
        .filter(Boolean)
        .join("\n");
    })
    .join("\n\n");

  let parsed: { fields?: unknown; notes?: unknown } | null = null;
  try {
    const message = await getAnthropic().messages.create({
      model: MODELS.structured,
      max_tokens: 2048,
      system: SYSTEM,
      messages: [
        {
          role: "user",
          content: `Here are ${sample.length} of my lessons. Describe the structure they already follow.\n\n${digest}`,
        },
      ],
    });
    const text = message.content
      .map((c) => (c.type === "text" ? c.text : ""))
      .join("");
    parsed = parseAiJson<{ fields?: unknown; notes?: unknown }>(text);
  } catch (err) {
    return apiError(ROUTE, 502, "upstream_failed", "Could not read your lessons just now. Try again in a moment.", {
      cause: err,
    });
  }

  const normalized = normalizeFields(
    Array.isArray(parsed?.fields) ? parsed.fields.slice(0, MAX_FIELDS) : null,
  );
  if (!normalized.ok) {
    // The model returned something unusable. Don't fail her — hand back the
    // starter and be honest that this one wasn't derived.
    return Response.json({
      fields: STARTER_FIELDS,
      sampled: sample.length,
      derived: false,
      notes: "Couldn't make sense of the structure in your lessons — here's a starting point to edit.",
    });
  }

  return Response.json({
    fields: normalized.fields,
    sampled: sample.length,
    derived: true,
    notes: typeof parsed?.notes === "string" ? parsed.notes.slice(0, 300) : null,
  });
}
