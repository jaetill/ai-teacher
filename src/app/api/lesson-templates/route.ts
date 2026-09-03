// /api/lesson-templates — the teacher's own lesson shapes (#647).
//
// GET    → her templates, plus the Classic builtin she can copy but not edit.
// POST   → { name, description?, fields, isDefault? } create one.
// PATCH  → { id, name?, description?, fields?, isDefault? } edit one.
// DELETE → ?id= remove one. Courses and lessons pointing at it fall back to
//          their next resolution step rather than breaking (the columns are
//          plain uuids, not FKs, precisely so a delete can't cascade into
//          curriculum content).
//
// Owner-scoped throughout: a template with owner_email = NULL is a builtin —
// readable by everyone, writable by no one.

import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { db } from "@/db";
import { lessonTemplates, courses, lessons } from "@/db/schema";
import { and, eq, isNull, or, ne } from "drizzle-orm";
import { isUuid, readJson } from "@/lib/api-utils";
import { normalizeFields, CLASSIC_FIELDS, type TemplateField } from "@/lib/lesson-template";

const MAX_NAME = 80;
const MAX_DESCRIPTION = 300;

async function ownerEmailOr401(): Promise<string | Response> {
  const session = await getServerSession(authOptions);
  const ownerEmail = session?.user?.email;
  if (!ownerEmail) {
    return Response.json({ error: "Not authenticated" }, { status: 401 });
  }
  return ownerEmail;
}

/** The always-present fallback, surfaced so the UI can show it as read-only. */
export const CLASSIC_BUILTIN = {
  id: null as string | null,
  name: "Classic",
  description: "The original shape: a single ordered list of activities.",
  fields: CLASSIC_FIELDS,
  isDefault: false,
  source: "builtin",
  builtin: true,
};

export async function GET() {
  const ownerEmail = await ownerEmailOr401();
  if (ownerEmail instanceof Response) return ownerEmail;

  const rows = await db
    .select({
      id: lessonTemplates.id,
      name: lessonTemplates.name,
      description: lessonTemplates.description,
      fields: lessonTemplates.fields,
      isDefault: lessonTemplates.isDefault,
      source: lessonTemplates.source,
      updatedAt: lessonTemplates.updatedAt,
    })
    .from(lessonTemplates)
    // Her own templates, plus any builtin seeded with a null owner.
    .where(or(eq(lessonTemplates.ownerEmail, ownerEmail), isNull(lessonTemplates.ownerEmail)));

  return Response.json({
    templates: rows.map((r) => ({ ...r, builtin: false })),
    builtin: CLASSIC_BUILTIN,
  });
}

type Body = {
  id?: string;
  name?: string;
  description?: string | null;
  fields?: unknown;
  isDefault?: boolean;
};

/** Only one template can be the default; clear the flag on the others. */
async function clearOtherDefaults(ownerEmail: string, keepId: string) {
  await db
    .update(lessonTemplates)
    .set({ isDefault: false })
    .where(and(eq(lessonTemplates.ownerEmail, ownerEmail), ne(lessonTemplates.id, keepId)));
}

export async function POST(req: Request) {
  const ownerEmail = await ownerEmailOr401();
  if (ownerEmail instanceof Response) return ownerEmail;

  const body = await readJson<Body>(req);
  if (!body) return Response.json({ error: "Invalid JSON body" }, { status: 400 });

  const name = (body.name ?? "").trim();
  if (name.length < 1 || name.length > MAX_NAME) {
    return Response.json({ error: `Name must be 1-${MAX_NAME} characters` }, { status: 400 });
  }
  const description = (body.description ?? "").trim().slice(0, MAX_DESCRIPTION) || null;

  const normalized = normalizeFields(body.fields);
  if (!normalized.ok) return Response.json({ error: normalized.error }, { status: 400 });

  const [created] = await db
    .insert(lessonTemplates)
    .values({
      ownerEmail,
      name,
      description,
      fields: normalized.fields,
      isDefault: body.isDefault === true,
      source: "manual",
    })
    .returning({ id: lessonTemplates.id });

  if (body.isDefault === true) await clearOtherDefaults(ownerEmail, created.id);

  return Response.json({ id: created.id, fields: normalized.fields });
}

export async function PATCH(req: Request) {
  const ownerEmail = await ownerEmailOr401();
  if (ownerEmail instanceof Response) return ownerEmail;

  const body = await readJson<Body>(req);
  if (!body) return Response.json({ error: "Invalid JSON body" }, { status: 400 });
  if (!body.id || !isUuid(body.id)) {
    return Response.json({ error: "Invalid template id" }, { status: 400 });
  }

  const updates: {
    name?: string;
    description?: string | null;
    fields?: TemplateField[];
    isDefault?: boolean;
    updatedAt?: Date;
  } = {};

  if (body.name !== undefined) {
    const name = body.name.trim();
    if (name.length < 1 || name.length > MAX_NAME) {
      return Response.json({ error: `Name must be 1-${MAX_NAME} characters` }, { status: 400 });
    }
    updates.name = name;
  }
  if (body.description !== undefined) {
    updates.description = (body.description ?? "").trim().slice(0, MAX_DESCRIPTION) || null;
  }
  if (body.fields !== undefined) {
    const normalized = normalizeFields(body.fields);
    if (!normalized.ok) return Response.json({ error: normalized.error }, { status: 400 });
    updates.fields = normalized.fields;
  }
  if (body.isDefault !== undefined) updates.isDefault = body.isDefault === true;

  if (Object.keys(updates).length === 0) {
    return Response.json({ error: "Nothing to update" }, { status: 400 });
  }
  updates.updatedAt = new Date();

  // Owner-scoped: a builtin (owner_email NULL) never matches, so it can't be
  // edited even by a caller who knows its id.
  const [row] = await db
    .select({ id: lessonTemplates.id })
    .from(lessonTemplates)
    .where(and(eq(lessonTemplates.id, body.id), eq(lessonTemplates.ownerEmail, ownerEmail)))
    .limit(1);
  if (!row) return Response.json({ error: "Template not found" }, { status: 404 });

  await db.update(lessonTemplates).set(updates).where(eq(lessonTemplates.id, body.id));
  if (updates.isDefault === true) await clearOtherDefaults(ownerEmail, body.id);

  return Response.json({ ok: true });
}

export async function DELETE(req: Request) {
  const ownerEmail = await ownerEmailOr401();
  if (ownerEmail instanceof Response) return ownerEmail;

  const { searchParams } = new URL(req.url);
  const id = searchParams.get("id");
  if (!id || !isUuid(id)) {
    return Response.json({ error: "Invalid template id" }, { status: 400 });
  }

  const [row] = await db
    .select({ id: lessonTemplates.id })
    .from(lessonTemplates)
    .where(and(eq(lessonTemplates.id, id), eq(lessonTemplates.ownerEmail, ownerEmail)))
    .limit(1);
  if (!row) return Response.json({ error: "Template not found" }, { status: 404 });

  // Detach before deleting so nothing points at a missing template. Lesson
  // content is untouched — it just resolves against Classic again.
  // One transaction: a failure after the detaches used to leave lessons
  // pointing at Classic while the template still existed.
  await db.batch([
    db.update(courses).set({ lessonTemplateId: null }).where(eq(courses.lessonTemplateId, id)),
    db.update(lessons).set({ templateId: null }).where(eq(lessons.templateId, id)),
    db.delete(lessonTemplates).where(eq(lessonTemplates.id, id)),
  ]);

  return Response.json({ ok: true });
}
