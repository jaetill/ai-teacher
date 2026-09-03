// POST /api/differentiation
// Auth: requires NextAuth session
// Adapts an assignment, reading, or activity for a specific student need.
// Body: { content: string, studentNeed: string, outputRequest: string, grade?: number }
// Returns: streaming text/plain (markdown)

import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { getAnthropic } from "@/lib/anthropic";
import { checkAiRateLimit } from "@/lib/rate-limit";
import { readJson } from "@/lib/api-utils";
import { MODELS } from "@/lib/models";
import { recordAiUsage, usageFromStream } from "@/lib/ai-usage";

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
  const session = await getServerSession(authOptions);
  if (!session) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  const rateLimited = await checkAiRateLimit(session.user?.email);
  if (rateLimited) return rateLimited;

  const body = await readJson<{
    content: string;
    studentNeed: string;
    outputRequest: string;
    grade?: number;
  }>(request);
  if (!body) {
    return Response.json({ error: "Invalid JSON body" }, { status: 400 });
  }
  const { content, studentNeed, outputRequest, grade } = body;

  // Require non-empty strings. A non-string value (e.g. an array or number)
  // would pass a bare truthy check but make the MAX_BYTES `.length` guard below
  // behave unpredictably — letting a caller bypass the size cap (#525).
  if (
    typeof content !== "string" ||
    content.length === 0 ||
    typeof studentNeed !== "string" ||
    studentNeed.length === 0 ||
    typeof outputRequest !== "string" ||
    outputRequest.length === 0
  ) {
    return new Response(
      "content, studentNeed, and outputRequest are required and must be strings",
      { status: 400 }
    );
  }

  if (grade !== undefined && typeof grade !== "number") {
    return new Response("grade must be a number", { status: 400 });
  }

  const MAX_BYTES = 50_000;
  if (
    (content?.length ?? 0) + (studentNeed?.length ?? 0) + (outputRequest?.length ?? 0) >
    MAX_BYTES
  ) {
    return new Response("Request payload too large", { status: 413 });
  }

  const userMessage = `Please adapt the following for a specific student.

**Original Content:**
${content}
${grade ? `\n**Grade Level:** ${grade}` : ""}

**Student Need:**
${studentNeed}

**What I Need:**
${outputRequest}`;

  const stream = getAnthropic().messages.stream({
    model: MODELS.reasoning,
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
        // Usage is only known once the stream has drained; finalMessage()
        // resolves immediately at this point.
        await recordAiUsage({
          route: "/api/differentiation",
          ownerEmail: session.user?.email,
          model: MODELS.reasoning,
          usage: await usageFromStream(stream),
          entityType: "differentiation",
        });
      } catch (err) {
        // Log server-side (was silently swallowed) and don't call close() on
        // an errored controller — that throws and masks the original failure.
        console.error("[differentiation] Anthropic stream failed:", err);
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
