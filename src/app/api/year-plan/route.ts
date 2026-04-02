// POST /api/year-plan
// Auth: none
// Streams a full-year curriculum plan for a given grade and standards set.
// Body: { grade: 6|7|8, schoolYear: string, standards: string, existingCurriculum?: string, notes?: string }
// Returns: streaming text/plain (markdown + JSON sentinel at end)
//
// The response ends with a machine-readable sentinel block:
//   \n---UNITS---\n
//   [{"title","weeks","standards","summary","anchorTexts","flags"}, ...]
// The client strips this from display and parses it to build unit cards.

import Anthropic from "@anthropic-ai/sdk";

const client = new Anthropic();

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
  const body = await request.json();
  const { grade, schoolYear, standards, existingCurriculum, notes } =
    body as {
      grade: number;
      schoolYear: string;
      standards: string;
      existingCurriculum?: string;
      notes?: string;
    };

  if (!grade || !schoolYear || !standards) {
    return new Response("grade, schoolYear, and standards are required", {
      status: 400,
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
