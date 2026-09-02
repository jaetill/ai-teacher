// POST /api/upload/classify
// Auth: requires Google OAuth session
// Accepts filenames and uses Claude to classify each into
// grade, destination (quarter or year plan), category, and material type.

import { getAccessToken, getUserEmail } from "@/lib/auth-helpers";
import { getAnthropic } from "@/lib/anthropic";
import { checkAiRateLimit } from "@/lib/rate-limit";
import { readJson } from "@/lib/api-utils";
import { MODELS } from "@/lib/models";
import { parseAiJson } from "@/lib/parse-ai-json";
import { apiError } from "@/lib/error-log";

const ROUTE = "/api/upload/classify";

// Caps on the classification request. Every other array-accepting route
// validates its payload before interpolating into a prompt (#536, #477); this
// one handles zip imports, so the ceiling is high but bounded.
const MAX_FILENAMES = 500;
const MAX_FILENAME_CHARS = 500;
const MAX_ZIPNAME_CHARS = 200;

const SYSTEM_PROMPT = `You classify teaching materials for a middle-school English class (grades 6-8).

For each filename, infer:
1. **grade** (6, 7, or 8) — look for "Grade 6/7/8", "G6/G7/G8", or grade-level clues. If unclear, use the context from the zip name or default to 8.
2. **destination** — which quarter (Q1, Q2, Q3, Q4) or "YearPlan" if it's a full-year overview, pacing guide, or standards map.
3. **category** — one of:
   - Curriculum: overviews, timelines, pacing guides, scope-and-sequence docs, curriculum maps
   - Lessons: lesson plans, slide decks, guided notes, reading passages, vocabulary lists, presentations used for daily instruction
   - Activities: worksheets, graphic organizers, group work, projects, creative writing prompts, handouts for student practice
   - Assessments: quizzes, tests, rubrics, essay prompts, answer keys
   - Resources: supplementary source materials, reference documents, articles, timelines, or external content used to build activities but not student-facing on their own
4. **materialType** — one of: reading, activity, rubric, lesson, assessment, resource, curriculum, other
   - reading: reading passages, novels, articles, texts students read
   - activity: worksheets, graphic organizers, group work, projects, creative writing prompts, student practice handouts
   - rubric: rubrics, scoring guides
   - lesson: lesson plans, slide decks, presentations, guided notes, vocabulary lists, daily instruction materials
   - assessment: quizzes, tests, essay prompts, answer keys, exit tickets
   - resource: supplementary source materials, reference documents, teacher resources
   - curriculum: quarter overviews, pacing guides, scope-and-sequence, curriculum maps
   - other: anything that doesn't fit the above

Return ONLY a JSON array with one object per filename:
[{"filename": "...", "grade": 8, "destination": "Q1", "category": "Lessons", "materialType": "lesson"}]

No markdown fencing, no explanation — just the JSON array.`;

export async function POST(req: Request) {
  const accessToken = await getAccessToken(req);
  if (!accessToken) {
    return Response.json({ error: "Not authenticated" }, { status: 401 });
  }

  const rateLimited = await checkAiRateLimit(await getUserEmail());
  if (rateLimited) return rateLimited;

  const body = await readJson<{ filenames: string[]; zipName?: string }>(req);
  if (!body) {
    return Response.json({ error: "Invalid JSON body" }, { status: 400 });
  }
  const { filenames, zipName } = body;

  if (!Array.isArray(filenames) || filenames.length === 0) {
    return Response.json({ error: "No filenames provided" }, { status: 400 });
  }
  if (filenames.length > MAX_FILENAMES) {
    return Response.json(
      { error: `Too many filenames (max ${MAX_FILENAMES})` },
      { status: 413 },
    );
  }
  if (!filenames.every((f) => typeof f === "string" && f.length <= MAX_FILENAME_CHARS)) {
    return Response.json(
      { error: `filenames must be strings of at most ${MAX_FILENAME_CHARS} chars` },
      { status: 400 },
    );
  }
  if (zipName !== undefined && (typeof zipName !== "string" || zipName.length > MAX_ZIPNAME_CHARS)) {
    return Response.json(
      { error: `zipName must be a string of at most ${MAX_ZIPNAME_CHARS} chars` },
      { status: 400 },
    );
  }

  const contextHint = zipName
    ? `\nThe zip file was named: "${zipName}" — use this as a hint for grade/quarter.\n`
    : "";

  const message = await getAnthropic().messages.create({
    model: MODELS.structured,
    max_tokens: 4096,
    system: SYSTEM_PROMPT,
    messages: [
      {
        role: "user",
        content: `${contextHint}Classify these ${filenames.length} files:\n\n${filenames.map((f, i) => `${i + 1}. ${f}`).join("\n")}`,
      },
    ],
  });

  const text =
    message.content[0].type === "text" ? message.content[0].text : "";

  const classifications = parseAiJson<unknown>(text);
  if (classifications !== null) {
    return Response.json({ classifications });
  }
  return apiError(ROUTE, 500, "ai_parse_failed", "Failed to parse classification response", {
    detail: { responseChars: text.length },
  });
}
