// POST /api/curriculum/editor/update-material
// Updates the role on a material_attachment and/or the materialType on the material itself.

import { db } from "@/db";
import { materialAttachments, materials } from "@/db/schema";
import { eq } from "drizzle-orm";

const VALID_ROLES = ["primary", "supporting", "teacher_reference"];
const VALID_MATERIAL_TYPES = [
  "presentation",
  "worksheet",
  "reading",
  "rubric",
  "answer_key",
  "handout",
  "video_link",
  "other",
];

export async function POST(req: Request) {
  const body = await req.json();
  const { attachmentId, role, materialType } = body as {
    attachmentId: string;
    role?: string;
    materialType?: string;
  };

  if (!attachmentId) {
    return Response.json({ error: "attachmentId required" }, { status: 400 });
  }

  if (!role && !materialType) {
    return Response.json({ error: "role or materialType required" }, { status: 400 });
  }

  if (role && !VALID_ROLES.includes(role)) {
    return Response.json({ error: `Invalid role: ${role}` }, { status: 400 });
  }

  if (materialType && !VALID_MATERIAL_TYPES.includes(materialType)) {
    return Response.json({ error: `Invalid materialType: ${materialType}` }, { status: 400 });
  }

  // Look up the attachment to get the materialId
  const [attachment] = await db
    .select()
    .from(materialAttachments)
    .where(eq(materialAttachments.id, attachmentId))
    .limit(1);

  if (!attachment) {
    return Response.json({ error: "Attachment not found" }, { status: 404 });
  }

  // Update role on the attachment
  if (role) {
    await db
      .update(materialAttachments)
      .set({ role })
      .where(eq(materialAttachments.id, attachmentId));
  }

  // Update materialType on the material itself
  if (materialType) {
    await db
      .update(materials)
      .set({ materialType, updatedAt: new Date() })
      .where(eq(materials.id, attachment.materialId));
  }

  return Response.json({ ok: true });
}
