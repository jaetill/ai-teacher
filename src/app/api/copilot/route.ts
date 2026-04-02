// POST /api/copilot
// Auth: none (unauthenticated for now)
// Streams a Teacher Copilot response from Claude.
// Body: { messages: Message[], context?: string, conversationId?: string }
// Returns: streaming text/plain
// Headers: X-Conversation-Id (returned so client can persist across turns)

import Anthropic from "@anthropic-ai/sdk";
import { db } from "@/db";
import { copilotConversations, copilotMessages } from "@/db/schema";
import { eq, sql } from "drizzle-orm";

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
  const { messages, context, conversationId } = body as {
    messages: Anthropic.MessageParam[];
    context?: string;
    conversationId?: string;
  };

  if (!messages || messages.length === 0) {
    return new Response("messages are required", { status: 400 });
  }

  // ── Get or create conversation ───
  let convId = conversationId;
  if (!convId) {
    const [conv] = await db
      .insert(copilotConversations)
      .values({
        systemContext: context ? { context } : undefined,
      })
      .returning({ id: copilotConversations.id });
    convId = conv.id;
  }

  // ── Save the new user message ───
  const userMsg = messages[messages.length - 1];
  const userContent =
    typeof userMsg.content === "string"
      ? userMsg.content
      : JSON.stringify(userMsg.content);
  const messageIndex = messages.length - 1;

  await db.insert(copilotMessages).values({
    conversationId: convId,
    role: "user",
    content: userContent,
    sortOrder: messageIndex,
  });

  // ── Stream the response ───
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

  let assistantText = "";

  const encoder = new TextEncoder();
  const readable = new ReadableStream({
    async start(controller) {
      try {
        for await (const event of stream) {
          if (
            event.type === "content_block_delta" &&
            event.delta.type === "text_delta"
          ) {
            assistantText += event.delta.text;
            controller.enqueue(encoder.encode(event.delta.text));
          }
        }

        // ── Save assistant message after streaming completes ───
        await db.insert(copilotMessages).values({
          conversationId: convId!,
          role: "assistant",
          content: assistantText,
          sortOrder: messageIndex + 1,
          model: "claude-opus-4-6",
        });

        // Update conversation metadata
        await db
          .update(copilotConversations)
          .set({
            messageCount: sql`${copilotConversations.messageCount} + 2`,
            updatedAt: new Date(),
          })
          .where(eq(copilotConversations.id, convId!));
      } catch (err) {
        controller.error(err);
      } finally {
        controller.close();
      }
    },
  });

  return new Response(readable, {
    headers: {
      "Content-Type": "text/plain; charset=utf-8",
      "X-Conversation-Id": convId,
      "Access-Control-Expose-Headers": "X-Conversation-Id",
    },
  });
}
