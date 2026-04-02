// POST /api/upload/classify
// Auth: requires Google OAuth session
// Accepts filenames and uses Claude to classify each into
// grade, destination (quarter or year plan), category, and material type.

import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import Anthropic from "@anthropic-ai/sdk";

const client = new Anthropic();

const SYSTEM_PROMPT = `You classify teaching materials for a middle-school English class (grades 6-8).

For each filename, infer:
1. **grade** (6, 7, or 8) — look for "Grade 6/7/8", "G6/G7/G8", or grade-level clues. If unclear, use the context from the zip name or default to 8.
2. **destination** — which quarter (Q1, Q2, Q3, Q4) or "YearPlan" if it's a full-year overview, pacing guide, or standards map.
3. **category** — one of:
   - Curriculum: overviews, timelines, pacing guides, scope-and-sequence docs, curriculum maps
   - Lessons: lesson plans, slide decks, guided notes, reading passages, vocabulary lists, presentations used for daily instruction
   - Activities: worksheets, graphic organizers, group work, projects, creative writing prompts, handouts for student practice
   - Assessments: quizzes, tests, rubrics, essay prompts, answer keys
4. **materialType** — one of: presentation, worksheet, reading, rubric, answer_key, handout, other

Return ONLY a JSON array with one object per filename:
[{"filename": "...", "grade": 8, "destination": "Q1", "category": "Lessons", "materialType": "presentation"}]

No markdown fencing, no explanation — just the JSON array.`;

export async function POST(req: Request) {
  const session = await getServerSession(authOptions);
  if (!session?.accessToken) {
    return Response.json({ error: "Not authenticated" }, { status: 401 });
  }

  const { filenames, zipName } = (await req.json()) as {
    filenames: string[];
    zipName?: string;
  };

  if (!filenames?.length) {
    return Response.json({ error: "No filenames provided" }, { status: 400 });
  }

  const contextHint = zipName
    ? `\nThe zip file was named: "${zipName}" — use this as a hint for grade/quarter.\n`
    : "";

  const message = await client.messages.create({
    model: "claude-sonnet-4-20250514",
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

  try {
    const classifications = JSON.parse(text);
    return Response.json({ classifications });
  } catch {
    return Response.json(
      { error: "Failed to parse classification response", raw: text },
      { status: 500 }
    );
  }
}
