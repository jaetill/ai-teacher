import { db } from "@/db";
import { curriculumEditLog } from "@/db/schema";
import type { EditAction } from "@/types/curriculum-editor";

export async function logEdit(params: {
  courseId: string;
  action: EditAction;
  entityType: string;
  entityId: string;
  previousValue?: unknown;
  newValue?: unknown;
}) {
  await db.insert(curriculumEditLog).values({
    courseId: params.courseId,
    action: params.action,
    entityType: params.entityType,
    entityId: params.entityId,
    previousValue: params.previousValue ?? null,
    newValue: params.newValue ?? null,
  });
}
