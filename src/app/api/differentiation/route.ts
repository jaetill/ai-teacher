// POST /api/differentiation
// Auth: none
// Adapts an assignment, reading, or activity for a specific student need.
// Body: { content: string, studentNeed: string, outputRequest: string, grade?: number }
// Returns: streaming text/plain (markdown)

import Anthropic from "@anthropic-ai/sdk";

const client = new Anthropic();

const SYSTEM_PROMPT = `You are an expert middle school ELA teacher with deep experience adapting materials for diverse learners.

When given an original assignment, reading passage, or activity, you adapt it based on a specific student need. You:
- Preserve the core learning objective — the student should still be doing the same essential task
- Make targeted, purposeful changes — don't oversimplify or over-enrich unnecessarily
- Maintain the student's dignity — adapted versions should never feel "dumbed down" or patronizing
- Add scaffolds, supports, or extensions that are genuinely useful, not just cosmetic

Format your response as:

## Adapted Version
[The full adapted assignment/text/activity]

## What Changed and Why
[2-4 bullet points explaining the key adaptations and the reasoning behind each one]`;

export async function POST(request: Request) {
  const body = await request.json();
  const { content, studentNeed, outputRequest, grade } = body as {
    content: string;
    studentNeed: string;
    outputRequest: string;
    grade?: number;
  };

  if (!content || !studentNeed || !outputRequest) {
    return new Response("content, studentNeed, and outputRequest are required", {
      status: 400,
    });
  }

  const userMessage = `Please adapt the following for a specific student.

**Original Content:**
${content}
${grade ? `\n**Grade Level:** ${grade}` : ""}

**Student Need:**
${studentNeed}

**What I Need:**
${outputRequest}`;

  const stream = client.messages.stream({
    model: "claude-opus-4-6",
    max_tokens: 16000,
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
