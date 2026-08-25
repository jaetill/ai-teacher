// POST /api/import/plan
//
// Executes an ImportPlan: { source, levels, target, files?, dryRun? }.
//
// One endpoint replaces the old split between "copy these files into our Drive
// tree" and "build this quarter". Structure comes from the level map the
// teacher declared, placement is written as data on the material row, and the
// file itself is referenced where it already lives — never copied.
//
// dryRun computes everything and writes nothing, so the UI can show what will
// happen without a separate preview of the built curriculum.

import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { getAccessToken } from "@/lib/auth-helpers";
import { readJson } from "@/lib/api-utils";
import { scanTree, getDriveClient, type ScannedNode } from "@/lib/drive";
import {
  commitPlanMaterials,
  commitPlanUnits,
  previewPlan,
  resolveTargetCourse,
  validateImportPlan,
  MAX_PLAN_FILES,
  type ImportPlan,
} from "@/lib/import-plan";

export const maxDuration = 300;

type Body = ImportPlan & { dryRun?: boolean };

async function loadTree(accessToken: string, source: ImportPlan["source"]): Promise<ScannedNode> {
  if (source.kind === "drive-file") {
    const drive = getDriveClient(accessToken);
    const res = await drive.files.get({
      fileId: source.fileId,
      fields: "id, name, mimeType",
      supportsAllDrives: true,
    });
    return {
      id: `single:${res.data.id}`,
      name: res.data.name ?? "",
      mimeType: "application/vnd.google-apps.folder",
      isFolder: true,
      children: [
        {
          id: res.data.id!,
          name: res.data.name!,
          mimeType: res.data.mimeType!,
          isFolder: false,
          children: [],
        },
      ],
    };
  }
  return scanTree(accessToken, source.folderId);
}

export async function POST(req: Request) {
  const accessToken = await getAccessToken(req);
  if (!accessToken) {
    return Response.json({ error: "Not authenticated" }, { status: 401 });
  }
  const session = await getServerSession(authOptions);
  const ownerEmail = session?.user?.email;
  if (!ownerEmail) {
    return Response.json({ error: "Session missing email" }, { status: 401 });
  }

  const body = await readJson<Body>(req);
  if (!body) {
    return Response.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const errors = validateImportPlan(body);
  if (errors.length) {
    return Response.json({ error: "Invalid import plan", errors }, { status: 400 });
  }

  let tree: ScannedNode;
  try {
    tree = await loadTree(accessToken, body.source);
  } catch (err) {
    console.error("import plan scan failed:", err instanceof Error ? err.message : err);
    return Response.json({ error: "Failed to read the source folder" }, { status: 502 });
  }

  const preview = previewPlan(tree, body);

  if (preview.materials.length > MAX_PLAN_FILES) {
    return Response.json(
      {
        error: `Too many files in one import (${preview.materials.length}, max ${MAX_PLAN_FILES})`,
        preview,
      },
      { status: 400 }
    );
  }

  // Dry run resolves the course to report it, but never creates one — a
  // preview that leaves a course row behind is not a preview.
  if (body.dryRun) {
    const course = await resolveTargetCourse(body.target, ownerEmail, { create: false });
    return Response.json({
      dryRun: true,
      courseId: course?.id ?? null,
      courseWillBeCreated: !course,
      ...preview,
    });
  }

  if (!preview.materials.length) {
    return Response.json(
      { error: "Nothing to import — every file was excluded or the folder is empty.", ...preview },
      { status: 400 }
    );
  }

  const course = await resolveTargetCourse(body.target, ownerEmail, { create: true });
  if (!course) {
    return Response.json({ error: "Could not find or create the target course" }, { status: 500 });
  }

  let written;
  let built;
  try {
    written = await commitPlanMaterials(preview.materials, course.id, ownerEmail);
    // No staging step: the units exist the moment she imports. Her folders are
    // her units, so building them needs no model and no second click.
    built = await commitPlanUnits(preview.materials, course.id, {
      userId: session.user?.id,
    });
  } catch (err) {
    console.error("import plan commit failed:", err instanceof Error ? err.message : err);
    return Response.json({ error: "Failed to save the imported materials" }, { status: 500 });
  }

  return Response.json({
    courseId: course.id,
    courseCreated: course.created,
    created: written.created,
    updated: written.updated,
    total: preview.materials.length,
    unitsCreated: built.unitsCreated,
    unitsReused: built.unitsReused,
    units: preview.units,
    quarters: preview.quarters,
    warnings: preview.warnings,
  });
}
