// POST /api/copilot
// Auth: none (unauthenticated for now)
// Streams a Teacher Copilot response from Claude.
// Body: { messages: { role: "user" | "assistant"; content: string }[], context?: string }
// Returns: streaming text/plain (SSE-compatible via TransformStream)

import Anthropic from "@anthropic-ai/sdk";

const client = new Anthropic();

const SYSTEM_PROMPT = `You are an expert teacher planning assistant. You help teachers with:
- Creating rubrics, lesson plans, unit maps, and pacing guides
- Generating differentiated materials (ELL, SPED, above/below grade level)
- Writing vocabulary lists, discussion questions, and exit tickets
- Drafting parent and admin communications
- Transforming existing documents (e.g., simplifying a reading, converting notes to slides)

Be concise and practical. Produce ready-to-use outputs when asked. When generating structured content like rubrics or lesson plans, use clear formatting.`;

export async function POST(request: Request) {
  const body = await request.json();
  const { messages, context } = body as {
    messages: Anthropic.MessageParam[];
    context?: string;
  };

  if (!messages || messages.length === 0) {
    return new Response("messages are required", { status: 400 });
  }

  const system = context
    ? `${SYSTEM_PROMPT}\n\n── Current context ───\n${context}`
    : SYSTEM_PROMPT;

  const stream = client.messages.stream({
    model: "claude-opus-4-6",
    max_tokens: 64000,
    thinking: { type: "adaptive" },
    system,
    messages,
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
