// POST /api/communications
// Auth: none
// Drafts a parent or admin email from a plain-language situation description.
// Body: { recipient: "parent"|"admin", situation: string, tone: "positive"|"concerned"|"neutral", studentName?: string, recipientName?: string }
// Returns: streaming text/plain
//
// Output format (always):
//   Subject: [subject line]
//   [blank line]
//   [email body]

import Anthropic from "@anthropic-ai/sdk";

const client = new Anthropic();

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
  const body = await request.json();
  const { recipient, situation, tone, studentName, recipientName } = body as {
    recipient: "parent" | "admin";
    situation: string;
    tone: "positive" | "concerned" | "neutral";
    studentName?: string;
    recipientName?: string;
  };

  if (!recipient || !situation || !tone) {
    return new Response("recipient, situation, and tone are required", {
      status: 400,
    });
  }

  const userMessage = `Please draft an email with the following details:

**To:** ${recipient === "parent" ? "Parent/Guardian" : "School Administrator"}${recipientName ? ` (${recipientName})` : ""}
**Tone:** ${tone}${studentName ? `\n**Student:** ${studentName}` : ""}

**Situation:**
${situation}`;

  const stream = client.messages.stream({
    model: "claude-opus-4-6",
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
