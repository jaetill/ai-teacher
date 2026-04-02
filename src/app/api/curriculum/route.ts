// POST /api/curriculum
// Auth: none
// Generates a unit map, lesson sequence, and pacing guide from teacher inputs.
// Body: { grade: 6|7|8, theme: string, weeks: number, standards: string, context?: string }
// Returns: streaming text/plain (markdown)

import Anthropic from "@anthropic-ai/sdk";

const client = new Anthropic();

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
  const body = await request.json();
  const { grade, theme, weeks, standards, context } = body as {
    grade: number;
    theme: string;
    weeks: number;
    standards: string;
    context?: string;
  };

  if (!grade || !theme || !weeks || !standards) {
    return new Response("grade, theme, weeks, and standards are required", {
      status: 400,
    });
  }

  const userMessage = `Please create a complete unit plan with the following details:

**Grade:** ${grade}
**Unit Theme/Topic:** ${theme}
**Duration:** ${weeks} week${weeks !== 1 ? "s" : ""}
**Standards to Address:**
${standards}${context ? `\n\n**Additional Context:**\n${context}` : ""}`;

  const stream = client.messages.stream({
    model: "claude-opus-4-6",
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
        controller.error(err);
      } finally {
        controller.close();
      }
    },
  });

  return new Response(readable, {
    headers: { "Content-Type": "text/plain; charset=utf-8" },
  });
}
