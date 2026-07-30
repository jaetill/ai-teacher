// POST /api/copilot
// Auth: requires NextAuth session
// Streams a Teacher Copilot response from Claude.
// Body: { messages: Message[], context?: string, conversationId?: string }
// Returns: streaming text/plain
// Headers: X-Conversation-Id (returned so client can persist across turns)

import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import type Anthropic from "@anthropic-ai/sdk";
import { getAnthropic } from "@/lib/anthropic";
import { DRAFT_SYSTEM_INSTRUCTIONS } from "@/lib/draft-protocol";
import { checkAiRateLimit } from "@/lib/rate-limit";
import { readJson, UUID_RE } from "@/lib/api-utils";
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
  materials,
  materialAttachments,
  driveFolders,
} from "@/db/schema";
import { and, eq, sql, asc, inArray, isNull, or } from "drizzle-orm";

const BASE_SYSTEM_PROMPT = `You are an expert teacher planning assistant with full access to this teacher's curriculum database. You help teachers with:
- Creating rubrics, lesson plans, unit maps, and pacing guides
- Generating differentiated materials (ELL, SPED, above/below grade level)
- Writing vocabulary lists, discussion questions, and exit tickets
- Drafting parent and admin communications
- Transforming existing documents (e.g., simplifying a reading, converting notes to slides)
- Answering questions about their curriculum, standards coverage, and lesson alignment

Be concise and practical. Produce ready-to-use outputs when asked. When generating structured content like rubrics or lesson plans, use clear formatting.

You have the teacher's curriculum data below. Use it to answer questions accurately — don't ask the teacher to provide data you already have.

When an "Additional context" section is present, it describes the page the teacher is looking at RIGHT NOW. Anchor your answer there: "this", "here", and informal phrasings map onto the items it names — especially when it names a specific standard, answer about THAT standard by its exact ID and language before generalizing. When discussing where something is taught or assessed, cite her actual materials by title from the curriculum data (e.g. name the specific quiz or handout) rather than speaking generically.
${DRAFT_SYSTEM_INSTRUCTIONS}`;

async function buildCurriculumContext(ownerEmail: string): Promise<string> {
  const allCourses = await db
    .select()
    .from(courses)
    .where(eq(courses.ownerEmail, ownerEmail))
    .orderBy(asc(courses.grade));
  if (allCourses.length === 0) return "";

  const courseIds = allCourses.map((c) => c.id);

  const allUnits = await db
    .select()
    .from(units)
    .where(inArray(units.courseId, courseIds))
    .orderBy(asc(units.sortOrder));

  const unitIds = allUnits.map((u) => u.id);

  const allLessons = unitIds.length > 0
    ? await db
        .select({ id: lessons.id, unitId: lessons.unitId, title: lessons.title, sortOrder: lessons.sortOrder, objectives: lessons.objectives })
        .from(lessons)
        .where(inArray(lessons.unitId, unitIds))
        .orderBy(asc(lessons.sortOrder))
    : [];

  // Unit-level standards
  const allUnitStds = unitIds.length > 0
    ? await db
        .select({ unitId: unitStandards.unitId, standardId: unitStandards.standardId, emphasis: unitStandards.emphasis })
        .from(unitStandards)
        .where(inArray(unitStandards.unitId, unitIds))
    : [];

  const lessonIds = allLessons.map((l) => l.id);

  // Lesson-level standards
  const allLessonStds = lessonIds.length > 0
    ? await db
        .select({ lessonId: lessonStandards.lessonId, standardId: lessonStandards.standardId, coverageType: lessonStandards.coverageType })
        .from(lessonStandards)
        .where(inArray(lessonStandards.lessonId, lessonIds))
    : [];

  // ── Materials: linked (per lesson/unit) and pool (per course) ───
  const attachableIds = [...unitIds, ...lessonIds];
  const attachments = attachableIds.length > 0
    ? await db
        .select({
          materialId: materialAttachments.materialId,
          attachableType: materialAttachments.attachableType,
          attachableId: materialAttachments.attachableId,
        })
        .from(materialAttachments)
        .where(inArray(materialAttachments.attachableId, attachableIds))
    : [];

  // Pool scoping mirrors editor/pool/route.ts: materials living in this
  // owner's grade/quarter category Drive folders.
  const CATEGORIES = ["Curriculum", "Lessons", "Activities", "Assessments", "Resources"];
  const folderKeys = allCourses.flatMap((c) => {
    const qs = [...new Set(allUnits.filter((u) => u.courseId === c.id).map((u) => u.quarter).filter(Boolean))];
    return qs.flatMap((q) => CATEGORIES.map((cat) => `grade_${c.grade}_${q}_${cat}`));
  });
  const folderIds = folderKeys.length > 0
    ? (
        await db
          .select({ driveId: driveFolders.driveId })
          .from(driveFolders)
          .where(
            and(
              inArray(driveFolders.folderKey, folderKeys),
              or(eq(driveFolders.ownerEmail, ownerEmail), isNull(driveFolders.ownerEmail))
            )
          )
      ).map((f) => f.driveId)
    : [];

  const attachedMatIds = [...new Set(attachments.map((a) => a.materialId))];
  const matIdFilter = new Set(attachedMatIds);
  const folderMaterials = folderIds.length > 0
    ? await db
        .select({
          id: materials.id,
          title: materials.title,
          materialType: materials.materialType,
          description: materials.description,
          driveFolderId: materials.driveFolderId,
        })
        .from(materials)
        .where(inArray(materials.driveFolderId, folderIds))
    : [];
  const attachedOnlyMaterials = attachedMatIds.length > 0
    ? await db
        .select({ id: materials.id, title: materials.title, materialType: materials.materialType, description: materials.description })
        .from(materials)
        .where(inArray(materials.id, attachedMatIds))
    : [];
  const matById = new Map<string, { title: string; materialType: string; description: string | null }>();
  for (const m of [...folderMaterials, ...attachedOnlyMaterials]) matById.set(m.id, m);

  // Render a material with its AI summary when one exists (written by the
  // summarize pass) — this is what lets the model speak to what's INSIDE
  // her documents, not just their titles.
  const renderMat = (m: { title: string; materialType: string; description: string | null }) =>
    `${m.title} (${m.materialType})${m.description ? ` — ${m.description.slice(0, 240)}` : ""}`;

  const materialsFor = (type: string, id: string) =>
    attachments
      .filter((a) => a.attachableType === type && a.attachableId === id)
      .map((a) => matById.get(a.materialId))
      .filter(Boolean)
      .map((m) => renderMat(m!));

  // Standards descriptions
  const stdIds = new Set([
    ...allUnitStds.map(s => s.standardId),
    ...allLessonStds.map(s => s.standardId),
  ]);
  const stdRows = stdIds.size > 0
    ? await db.select({ id: standards.id, description: standards.description }).from(standards).where(inArray(standards.id, [...stdIds]))
    : [];
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
        const lessonMats = materialsFor("lesson", lesson.id);
        if (lessonMats.length > 0) {
          ctx += `    Materials: ${lessonMats.join("; ")}\n`;
        }
      }
      const unitMats = materialsFor("unit", unit.id);
      if (unitMats.length > 0) {
        ctx += `  Unit materials: ${unitMats.join("; ")}\n`;
      }
    }

    // Unlinked pool files — lets the model reference/search her documents by
    // title ("find vocab-related assessments") even when nothing is attached.
    const attachedSet = matIdFilter;
    const courseFolderMats = folderMaterials.filter((m) => !attachedSet.has(m.id));
    if (courseFolderMats.length > 0) {
      const MAX_POOL_LINES = 120;
      const listed = courseFolderMats.slice(0, MAX_POOL_LINES);
      ctx += `\nUnlinked files in the Grade ${course.grade} material pool (title (type)):\n`;
      for (const m of listed) ctx += `  ${renderMat(m)}\n`;
      if (courseFolderMats.length > MAX_POOL_LINES) {
        ctx += `  ...and ${courseFolderMats.length - MAX_POOL_LINES} more\n`;
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
  const session = await getServerSession(authOptions);
  if (!session) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  const rateLimited = await checkAiRateLimit(session.user?.email);
  if (rateLimited) return rateLimited;

  const body = await readJson<{
    messages: Anthropic.MessageParam[];
    context?: string;
    conversationId?: string;
  }>(request);
  if (!body) {
    return Response.json({ error: "Invalid JSON body" }, { status: 400 });
  }
  const { messages, context, conversationId } = body;

  if (!messages || messages.length === 0) {
    return new Response("messages are required", { status: 400 });
  }

  const MAX_CONTEXT_CHARS = 8_000;
  const MAX_MESSAGES = 50;
  const MAX_MESSAGE_CONTENT_CHARS = 10_000;

  if (context && context.length > MAX_CONTEXT_CHARS) {
    return new Response(`context too large (max ${MAX_CONTEXT_CHARS} chars)`, { status: 413 });
  }
  if (messages.length > MAX_MESSAGES) {
    return new Response(`too many messages (max ${MAX_MESSAGES})`, { status: 413 });
  }
  for (const msg of messages) {
    const contentLen =
      typeof msg.content === "string"
        ? msg.content.length
        : JSON.stringify(msg.content).length;
    if (contentLen > MAX_MESSAGE_CONTENT_CHARS) {
      return new Response(`message content too large (max ${MAX_MESSAGE_CONTENT_CHARS} chars)`, { status: 413 });
    }
  }

  if (conversationId && !UUID_RE.test(conversationId)) {
    return Response.json({ error: "Bad Request" }, { status: 400 });
  }

  // ── Get or create conversation ───
  let convId = conversationId;
  if (!convId) {
    const [conv] = await db
      .insert(copilotConversations)
      .values({
        ownerEmail: session.user?.email ?? null,
        systemContext: context ? { context } : undefined,
      })
      .returning({ id: copilotConversations.id });
    convId = conv.id;
  } else {
    const [conv] = await db
      .select({ ownerEmail: copilotConversations.ownerEmail })
      .from(copilotConversations)
      .where(eq(copilotConversations.id, convId));
    if (!conv || !conv.ownerEmail || !session.user?.email || conv.ownerEmail !== session.user.email) {
      return Response.json({ error: "Forbidden" }, { status: 403 });
    }
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
  const curriculumContext = await buildCurriculumContext(session.user?.email ?? "");
  const system = context
    ? `${BASE_SYSTEM_PROMPT}${curriculumContext}\n\n── Additional context ───\n${context}`
    : `${BASE_SYSTEM_PROMPT}${curriculumContext}`;

  const stream = getAnthropic().messages.stream({
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
      // Track enqueue failures (client disconnected: stop button, tab close,
      // navigation) separately from Anthropic stream failures. On disconnect
      // we keep consuming the stream so the full assistant turn can still be
      // persisted — otherwise a resumed conversation has user messages with
      // no assistant replies and colliding sortOrder values (#eval-2026-07).
      let clientGone = false;
      let streamError: unknown = null;

      try {
        for await (const event of stream) {
          if (
            event.type === "content_block_delta" &&
            event.delta.type === "text_delta"
          ) {
            assistantText += event.delta.text;
            if (!clientGone) {
              try {
                controller.enqueue(encoder.encode(event.delta.text));
              } catch {
                clientGone = true;
              }
            }
          }
        }
      } catch (err) {
        streamError = err;
        console.error("[copilot] Anthropic stream failed:", err);
      }

      // ── Persist whatever the model produced, even on disconnect/error ───
      if (assistantText.length > 0) {
        try {
          await db.insert(copilotMessages).values({
            conversationId: convId!,
            role: "assistant",
            content: assistantText,
            sortOrder: messageIndex + 1,
            model: "claude-opus-4-6",
          });

          await db
            .update(copilotConversations)
            .set({
              messageCount: sql`${copilotConversations.messageCount} + 2`,
              updatedAt: new Date(),
            })
            .where(eq(copilotConversations.id, convId!));
        } catch (err) {
          console.error("[copilot] failed to persist assistant message:", err);
        }
      }

      try {
        if (streamError && !clientGone) {
          controller.error(streamError);
        } else {
          controller.close();
        }
      } catch {
        // Controller already closed/errored — nothing left to signal.
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
