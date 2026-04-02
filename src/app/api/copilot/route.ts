// POST /api/copilot
// Auth: none (unauthenticated for now)
// Streams a Teacher Copilot response from Claude.
// Body: { messages: Message[], context?: string, conversationId?: string }
// Returns: streaming text/plain
// Headers: X-Conversation-Id (returned so client can persist across turns)

import Anthropic from "@anthropic-ai/sdk";
import { db } from "@/db";
import {
  copilotConversations,
  copilotMessages,
  courses,
  units,
  lessons,
  unitStandards,
  lessonStandards,
  standards,
} from "@/db/schema";
import { eq, sql, asc, inArray } from "drizzle-orm";

const client = new Anthropic();

const BASE_SYSTEM_PROMPT = `You are an expert teacher planning assistant with full access to this teacher's curriculum database. You help teachers with:
- Creating rubrics, lesson plans, unit maps, and pacing guides
- Generating differentiated materials (ELL, SPED, above/below grade level)
- Writing vocabulary lists, discussion questions, and exit tickets
- Drafting parent and admin communications
- Transforming existing documents (e.g., simplifying a reading, converting notes to slides)
- Answering questions about their curriculum, standards coverage, and lesson alignment

Be concise and practical. Produce ready-to-use outputs when asked. When generating structured content like rubrics or lesson plans, use clear formatting.

You have the teacher's curriculum data below. Use it to answer questions accurately — don't ask the teacher to provide data you already have.`;

async function buildCurriculumContext(): Promise<string> {
  const allCourses = await db.select().from(courses).orderBy(asc(courses.grade));
  if (allCourses.length === 0) return "";

  const allUnits = await db.select().from(units).orderBy(asc(units.sortOrder));
  const allLessons = await db
    .select({ id: lessons.id, unitId: lessons.unitId, title: lessons.title, sortOrder: lessons.sortOrder, objectives: lessons.objectives })
    .from(lessons)
    .orderBy(asc(lessons.sortOrder));

  // Unit-level standards
  const allUnitStds = await db
    .select({ unitId: unitStandards.unitId, standardId: unitStandards.standardId, emphasis: unitStandards.emphasis })
    .from(unitStandards);

  // Lesson-level standards
  const allLessonStds = await db
    .select({ lessonId: lessonStandards.lessonId, standardId: lessonStandards.standardId, coverageType: lessonStandards.coverageType })
    .from(lessonStandards);

  // Standards descriptions
  const stdIds = new Set([
    ...allUnitStds.map(s => s.standardId),
    ...allLessonStds.map(s => s.standardId),
  ]);
  const stdRows = stdIds.size > 0
    ? await db.select({ id: standards.id, description: standards.description }).from(standards).where(inArray(standards.id, [...stdIds]))
    : [];
  const stdMap = new Map(stdRows.map(s => [s.id, s.description]));

  let ctx = "\n── CURRICULUM DATABASE ──\n\n";

  for (const course of allCourses) {
    ctx += `## Grade ${course.grade} — ${course.title}\n`;
    if (course.teacherNotes) ctx += `Teacher notes: ${course.teacherNotes}\n`;

    const courseUnits = allUnits.filter(u => u.courseId === course.id);
    for (const unit of courseUnits) {
      const q = unit.quarter ?? `Q${Math.ceil(unit.sortOrder / 2)}`;
      ctx += `\n### ${q} — Unit ${unit.sortOrder}: ${unit.title} (${unit.durationWeeks} weeks)\n`;
      ctx += `Summary: ${unit.summary}\n`;
      if (unit.essentialQuestions) ctx += `Essential questions: ${unit.essentialQuestions}\n`;
      if (unit.anchorTexts) ctx += `Anchor texts: ${unit.anchorTexts}\n`;
      if (unit.teacherNotes) ctx += `Teacher notes: ${unit.teacherNotes}\n`;

      // Unit standards
      const uStds = allUnitStds.filter(s => s.unitId === unit.id);
      if (uStds.length > 0) {
        ctx += `Unit standards: ${uStds.map(s => s.standardId).join(", ")}\n`;
      }

      // Lessons
      const unitLessons = allLessons.filter(l => l.unitId === unit.id);
      for (const lesson of unitLessons) {
        const lStds = allLessonStds.filter(s => s.lessonId === lesson.id);
        const stdsStr = lStds.length > 0
          ? ` [${lStds.map(s => `${s.standardId}(${s.coverageType})`).join(", ")}]`
          : "";
        ctx += `  Day ${lesson.sortOrder}: ${lesson.title}${stdsStr}\n`;
        if (lesson.objectives?.length) {
          ctx += `    Objectives: ${lesson.objectives.join("; ")}\n`;
        }
      }
    }
    ctx += "\n";
  }

  // Standards reference
  if (stdRows.length > 0) {
    ctx += "## Standards Reference\n";
    for (const s of stdRows) {
      ctx += `${s.id}: ${s.description}\n`;
    }
  }

  return ctx;
}

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

  // ── Build system prompt with curriculum context ───
  const curriculumContext = await buildCurriculumContext();
  const system = context
    ? `${BASE_SYSTEM_PROMPT}${curriculumContext}\n\n── Additional context ───\n${context}`
    : `${BASE_SYSTEM_PROMPT}${curriculumContext}`;

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
