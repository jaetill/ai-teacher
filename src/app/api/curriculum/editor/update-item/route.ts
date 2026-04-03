// POST /api/curriculum/editor/update-item
// Generic inline-edit endpoint for titles, metadata, etc.

import { db } from "@/db";
import { lessons, assessments, units } from "@/db/schema";
import { eq } from "drizzle-orm";
import { logEdit } from "../log-edit";
import type { UpdateItemPayload } from "@/types/curriculum-editor";

const ALLOWED_FIELDS: Record<string, string[]> = {
  lesson: ["title", "sortOrder", "durationMinutes"],
  assessment: ["title", "sortOrder", "assessmentType"],
  unit: ["title", "sortOrder", "durationWeeks", "quarter"],
};

export async function POST(req: Request) {
  const body: UpdateItemPayload = await req.json();
  const { entityType, entityId, fields } = body;

  const allowed = ALLOWED_FIELDS[entityType];
  if (!allowed) {
    return Response.json({ error: "Invalid entity type" }, { status: 400 });
  }

  // Filter to only allowed fields
  const updates: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(fields)) {
    if (allowed.includes(key)) {
      updates[key] = value;
    }
  }

  if (Object.keys(updates).length === 0) {
    return Response.json({ error: "No valid fields to update" }, { status: 400 });
  }

  // Get current state and courseId
  let previousValue: Record<string, unknown> = {};
  let courseId: string;

  if (entityType === "lesson") {
    const [current] = await db.select().from(lessons).where(eq(lessons.id, entityId)).limit(1);
    if (!current) return Response.json({ error: "Not found" }, { status: 404 });
    previousValue = { title: current.title, sortOrder: current.sortOrder, durationMinutes: current.durationMinutes };
    const [unit] = await db.select({ courseId: units.courseId }).from(units).where(eq(units.id, current.unitId)).limit(1);
    courseId = unit!.courseId;

    // Map camelCase to snake_case for raw update
    const dbUpdates: Record<string, unknown> = { updated_at: new Date() };
    if ("title" in updates) dbUpdates.title = updates.title;
    if ("sortOrder" in updates) dbUpdates.sort_order = updates.sortOrder;
    if ("durationMinutes" in updates) dbUpdates.duration_minutes = updates.durationMinutes;
    await db.update(lessons).set(dbUpdates as never).where(eq(lessons.id, entityId));
  } else if (entityType === "assessment") {
    const [current] = await db.select().from(assessments).where(eq(assessments.id, entityId)).limit(1);
    if (!current) return Response.json({ error: "Not found" }, { status: 404 });
    previousValue = { title: current.title, sortOrder: current.sortOrder, assessmentType: current.assessmentType };
    const [unit] = await db.select({ courseId: units.courseId }).from(units).where(eq(units.id, current.unitId)).limit(1);
    courseId = unit!.courseId;

    const dbUpdates: Record<string, unknown> = { updated_at: new Date() };
    if ("title" in updates) dbUpdates.title = updates.title;
    if ("sortOrder" in updates) dbUpdates.sort_order = updates.sortOrder;
    if ("assessmentType" in updates) dbUpdates.assessment_type = updates.assessmentType;
    await db.update(assessments).set(dbUpdates as never).where(eq(assessments.id, entityId));
  } else {
    const [current] = await db.select().from(units).where(eq(units.id, entityId)).limit(1);
    if (!current) return Response.json({ error: "Not found" }, { status: 404 });
    previousValue = { title: current.title, sortOrder: current.sortOrder, durationWeeks: current.durationWeeks, quarter: current.quarter };
    courseId = current.courseId;

    const dbUpdates: Record<string, unknown> = { updated_at: new Date() };
    if ("title" in updates) dbUpdates.title = updates.title;
    if ("sortOrder" in updates) dbUpdates.sort_order = updates.sortOrder;
    if ("durationWeeks" in updates) dbUpdates.duration_weeks = updates.durationWeeks;
    if ("quarter" in updates) dbUpdates.quarter = updates.quarter;
    await db.update(units).set(dbUpdates as never).where(eq(units.id, entityId));
  }

  const action = "title" in updates ? "update_title" : "update_metadata";
  await logEdit({
    courseId,
    action,
    entityType,
    entityId,
    previousValue,
    newValue: updates,
  });

  return Response.json({ ok: true });
}
