// POST /api/year-plan
// Auth: requires NextAuth session
// Streams a full-year curriculum plan for a given grade and standards set.
// Body: { grade: 6|7|8, schoolYear: string, standards: string, existingCurriculum?: string, notes?: string }
// Returns: streaming text/plain (markdown + JSON sentinel at end)
//
// The response ends with a machine-readable sentinel block:
//   \n---UNITS---\n
//   [{"title","weeks","standards","summary","anchorTexts","flags"}, ...]
// The client strips this from display and parses it to build unit cards.

import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { getAnthropic } from "@/lib/anthropic";
import { checkAiRateLimit } from "@/lib/rate-limit";
import { readJson } from "@/lib/api-utils";
import { MODELS } from "@/lib/models";
import { refuse } from "@/lib/error-log";
import { recordAiUsage, usageFromStream } from "@/lib/ai-usage";

const ROUTE = "/api/year-plan";

const SYSTEM_PROMPT = `You are an expert middle school ELA curriculum designer specializing in full-year planning for grades 6-8.

When given a grade, school year, and standards, produce a complete year plan that:
- Organizes the year into 5-8 coherent thematic units in a logical sequence
- Ensures all provided standards are covered across the units
- Builds complexity and skill progression throughout the year
- Flags any content requiring sensitive handling for middle schoolers (trauma, mature themes, etc.)
- If given existing curriculum, reviews it honestly and notes what to keep, change, or add
- If given notes from the current year, uses them to inform recommendations

Format your response as follows:

## Grade [X] ELA — [School Year] Year Plan

### Overview
[2-3 sentences describing the year's arc, how units connect, and the skill progression]

### Unit Sequence

#### Unit 1 — [Title]
**Duration:** X weeks
**Standards:** [comma-separated standards]
**Summary:** [2-3 sentences: what students read, write, and learn]
**Anchor Text(s):** [1-2 suggested primary texts]
**Flags:** [content sensitivity notes, or "None"]

[Repeat for all units]

---UNITS---
[JSON array with one object per unit. Use exactly these keys: title, weeks, standards, summary, anchorTexts, flags]`;

export async function POST(request: Request) {
  const session = await getServerSession(authOptions);
  if (!session) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  const rateLimited = await checkAiRateLimit(session.user?.email);
  if (rateLimited) return rateLimited;

  const body = await readJson<{
    grade: number;
    schoolYear: string;
    standards: string;
    existingCurriculum?: string;
    notes?: string;
  }>(request);
  if (!body) {
    return Response.json({ error: "Invalid JSON body" }, { status: 400 });
  }
  const { grade, schoolYear, standards, existingCurriculum, notes } = body;

  if (!grade || !schoolYear || !standards) {
    return new Response("grade, schoolYear, and standards are required", {
      status: 400,
    });
  }

  if (![6, 7, 8].includes(grade)) {
    return new Response("grade must be 6, 7, or 8", { status: 400 });
  }

  // The size cap below measures .length on these fields; a non-string value
  // would make .length undefined and skip the cap, bypassing the quota (#477).
  if (
    typeof schoolYear !== "string" ||
    typeof standards !== "string" ||
    (existingCurriculum !== undefined && typeof existingCurriculum !== "string") ||
    (notes !== undefined && typeof notes !== "string")
  ) {
    return new Response("text fields must be strings", { status: 400 });
  }

  if (
    schoolYear.length > 50 ||
    standards.length > 10_000 ||
    (existingCurriculum && existingCurriculum.length > 20_000) ||
    (notes && notes.length > 5_000)
  ) {
    return refuse({
      route: ROUTE,
      status: 413,
      reason: "input_too_large",
      message: "Input too large",
      detail: {
        schoolYearChars: schoolYear.length,
        standardsChars: standards.length,
        existingCurriculumChars: existingCurriculum?.length ?? 0,
        notesChars: notes?.length ?? 0,
        limits: "schoolYear 50 / standards 10000 / existing 20000 / notes 5000",
      },
    });
  }

  let userMessage = `Please create a year plan:

**Grade:** ${grade}
**School Year:** ${schoolYear}
**Standards to Cover:**
${standards}`;

  if (existingCurriculum) {
    userMessage += `\n\n**Existing Curriculum (review and suggest improvements):**\n${existingCurriculum}`;
  }

  if (notes) {
    userMessage += `\n\n**Notes from this year to inform next year's planning:**\n${notes}`;
  }

  const stream = getAnthropic().messages.stream({
    model: MODELS.reasoning,
    max_tokens: 64000,
    thinking: { type: "adaptive" },
    system: SYSTEM_PROMPT,
    messages: [{ role: "user", content: userMessage }],
  });

  const encoder = new TextEncoder();
  const readable = new ReadableStream({
    async start(controller) {
      try {
        for await (const event of stream) {
          if (
            event.type === "content_block_delta" &&
            event.delta.type === "text_delta"
          ) {
            controller.enqueue(encoder.encode(event.delta.text));
          }
        }
        // Usage is only known once the stream has drained; finalMessage()
        // resolves immediately at this point.
        await recordAiUsage({
          route: "/api/year-plan",
          ownerEmail: session.user?.email,
          model: MODELS.reasoning,
          usage: await usageFromStream(stream),
          entityType: "year_plan",
        });
      } catch (err) {
        // Log server-side (was silently swallowed) and don't call close() on
        // an errored controller — that throws and masks the original failure.
        console.error("[year-plan] Anthropic stream failed:", err);
        try {
          controller.error(err);
        } catch {
          // Controller already closed (client disconnected) — nothing to signal.
        }
        return;
      }
      try {
        controller.close();
      } catch {
        // Client disconnected mid-stream; controller already closed.
      }
    },
  });

  return new Response(readable, {
    headers: { "Content-Type": "text/plain; charset=utf-8" },
  });
}
