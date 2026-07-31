// POST /api/communications
// Auth: requires NextAuth session
// Drafts a parent or admin email from a plain-language situation description.
// Body: { recipient: "parent"|"admin", situation: string, tone: "positive"|"concerned"|"neutral", studentName?: string, recipientName?: string }
// Returns: streaming text/plain
//
// Output format (always):
//   Subject: [subject line]
//   [blank line]
//   [email body]

import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { getAnthropic } from "@/lib/anthropic";
import { checkAiRateLimit } from "@/lib/rate-limit";
import { readJson } from "@/lib/api-utils";
import { MODELS } from "@/lib/models";

const SYSTEM_PROMPT = `You are helping a middle school ELA teacher at a private school draft professional communications.

Write warm, clear, and professional emails. Tone should feel like a caring teacher who knows the family — not a form letter, not corporate HR language.

Always format your response exactly like this:
Subject: [subject line]

[email body]

Guidelines:
- Keep emails concise — 3-5 short paragraphs max
- Lead with the purpose of the email in the first sentence
- For concern emails: be direct but compassionate, always end with an invitation to connect
- For positive emails: be specific about what the student did well
- For admin emails: be factual and organized, lead with the key point
- Use [Teacher's Name] as a placeholder for the sign-off
- If a student name is provided, use it naturally — don't overuse it
- If a recipient name is provided, use it in the greeting; otherwise use "Dear Parent/Guardian" or "Dear [Name]"
- Do not invent specific details not mentioned in the situation`;

export async function POST(request: Request) {
  const session = await getServerSession(authOptions);
  if (!session) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  const rateLimited = await checkAiRateLimit(session.user?.email);
  if (rateLimited) return rateLimited;

  const body = await readJson<{
    recipient: "parent" | "admin";
    situation: string;
    tone: "positive" | "concerned" | "neutral";
    studentName?: string;
    recipientName?: string;
  }>(request);
  if (!body) {
    return Response.json({ error: "Invalid JSON body" }, { status: 400 });
  }
  const { recipient, situation, tone, studentName, recipientName } = body;

  if (!recipient || !situation || !tone) {
    return new Response("recipient, situation, and tone are required", {
      status: 400,
    });
  }

  if ((situation?.length ?? 0) > 10_000) {
    return new Response("situation too long (max 10 000 chars)", {
      status: 413,
    });
  }
  if ((studentName?.length ?? 0) > 100) {
    return new Response("studentName too long (max 100 chars)", {
      status: 413,
    });
  }
  if ((recipientName?.length ?? 0) > 100) {
    return new Response("recipientName too long (max 100 chars)", {
      status: 413,
    });
  }
  if ((tone?.length ?? 0) > 50) {
    return new Response("tone too long (max 50 chars)", { status: 413 });
  }

  const userMessage = `Please draft an email with the following details:

**To:** ${recipient === "parent" ? "Parent/Guardian" : "School Administrator"}${recipientName ? ` (${recipientName})` : ""}
**Tone:** ${tone}${studentName ? `\n**Student:** ${studentName}` : ""}

**Situation:**
${situation}`;

  const stream = getAnthropic().messages.stream({
    model: MODELS.reasoning,
    max_tokens: 4000,
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
        console.error("[communications] Anthropic stream failed:", err);
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
