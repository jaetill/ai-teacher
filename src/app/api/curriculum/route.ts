// POST /api/curriculum
// Auth: requires NextAuth session
// Generates a unit map, lesson sequence, and pacing guide from teacher inputs.
// Body: { grade: 6|7|8, theme: string, weeks: number, standards: string, context?: string }
// Returns: streaming text/plain (markdown)

import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { getAnthropic } from "@/lib/anthropic";
import { checkAiRateLimit } from "@/lib/rate-limit";
import { readJson } from "@/lib/api-utils";

const SYSTEM_PROMPT = `You are an expert middle school ELA curriculum designer. You create detailed, practical unit plans for grades 6-8 English Language Arts.

When given a grade level, unit theme, duration, and standards, you produce a complete unit plan in clean markdown with the following structure:

## Unit Title
A concise, engaging title for the unit.

## Unit Overview
2-3 sentences describing the unit's focus, essential questions, and what students will walk away understanding.

## Standards Addressed
List each standard provided and briefly explain how the unit addresses it.

## Learning Objectives
By the end of this unit, students will be able to:
- (list 4-6 clear, measurable objectives)

## Week-by-Week Pacing Guide
For each week, provide:
### Week N: [Week Theme]
**Focus:** What this week is building toward
**Lessons:**
- **Lesson N.1 — [Title]**: Brief description of activities and purpose
- **Lesson N.2 — [Title]**: Brief description
- **Lesson N.3 — [Title]**: Brief description
(3-5 lessons per week depending on the schedule)

## Summative Assessment
Describe the end-of-unit assessment and how it connects to the standards and objectives.

## Suggested Texts & Resources
List 3-5 suggested anchor texts, supplementary readings, or media that fit the theme and grade level.

Be specific and practical. Lesson descriptions should be concrete enough that a teacher knows what they're doing that day, not just vague topics. Calibrate complexity and reading level appropriately for the grade.`;

export async function POST(request: Request) {
  const session = await getServerSession(authOptions);
  if (!session) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  const rateLimited = await checkAiRateLimit(session.user?.email);
  if (rateLimited) return rateLimited;

  const body = await readJson<{
    grade: number;
    theme: string;
    weeks: number;
    standards: string;
    context?: string;
  }>(request);
  if (!body) {
    return Response.json({ error: "Invalid JSON body" }, { status: 400 });
  }
  const { grade, theme, weeks, standards, context } = body;

  if (!grade || !theme || !weeks || !standards) {
    return new Response("grade, theme, weeks, and standards are required", {
      status: 400,
    });
  }

  // grade/weeks are numbers; a non-number (e.g. a huge string) would pass the
  // truthy check above and skip the size cap below (which only measures the
  // string fields), bypassing the quota and being interpolated into the prompt (#477).
  if (typeof grade !== "number" || typeof weeks !== "number") {
    return new Response("grade and weeks must be numbers", { status: 400 });
  }

  if (
    theme.length > 1_000 ||
    standards.length > 10_000 ||
    (context && context.length > 5_000)
  ) {
    return new Response("Input too large", { status: 413 });
  }

  const userMessage = `Please create a complete unit plan with the following details:

**Grade:** ${grade}
**Unit Theme/Topic:** ${theme}
**Duration:** ${weeks} week${weeks !== 1 ? "s" : ""}
**Standards to Address:**
${standards}${context ? `\n\n**Additional Context:**\n${context}` : ""}`;

  const stream = getAnthropic().messages.stream({
    model: "claude-opus-4-8",
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
      } catch (err) {
        // Log server-side (was silently swallowed) and don't call close() on
        // an errored controller — that throws and masks the original failure.
        console.error("[curriculum] Anthropic stream failed:", err);
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
