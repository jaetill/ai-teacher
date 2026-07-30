// GET  /api/glossary — default terms merged with the owner's overrides.
// POST /api/glossary — upsert the owner's definition for a known term
//                      ({ termKey, definition }); empty definition reverts
//                      to the app default by deleting the override.
//
// The glossary is a temporary alignment instrument (see glossary-terms.ts):
// defaults are the app's inferences, overrides are the teacher's own words.

import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { db } from "@/db";
import { glossaryTerms } from "@/db/schema";
import { and, eq } from "drizzle-orm";
import { readJson } from "@/lib/api-utils";
import {
  DEFAULT_TERMS,
  TERM_KEYS,
  MAX_DEFINITION_CHARS,
} from "@/lib/glossary-terms";

export async function GET() {
  const session = await getServerSession(authOptions);
  const ownerEmail = session?.user?.email;
  if (!ownerEmail) {
    return Response.json({ error: "Not authenticated" }, { status: 401 });
  }

  const overrides = await db
    .select({
      termKey: glossaryTerms.termKey,
      definition: glossaryTerms.definition,
      updatedAt: glossaryTerms.updatedAt,
    })
    .from(glossaryTerms)
    .where(eq(glossaryTerms.ownerEmail, ownerEmail));

  const byKey = new Map(overrides.map((o) => [o.termKey, o]));
  const terms = DEFAULT_TERMS.map((t) => {
    const o = byKey.get(t.key);
    return {
      ...t,
      definition: o?.definition ?? t.definition,
      edited: !!o,
      defaultDefinition: t.definition,
    };
  });

  return Response.json({ terms });
}

export async function POST(req: Request) {
  const session = await getServerSession(authOptions);
  const ownerEmail = session?.user?.email;
  if (!ownerEmail) {
    return Response.json({ error: "Not authenticated" }, { status: 401 });
  }

  const body = await readJson<{ termKey?: string; definition?: string }>(req);
  if (!body) {
    return Response.json({ error: "Invalid JSON body" }, { status: 400 });
  }
  const termKey = typeof body.termKey === "string" ? body.termKey : "";
  if (!TERM_KEYS.has(termKey)) {
    return Response.json({ error: "Unknown termKey" }, { status: 400 });
  }
  const definition =
    typeof body.definition === "string" ? body.definition.trim() : "";
  if (definition.length > MAX_DEFINITION_CHARS) {
    return Response.json(
      { error: `definition too long (max ${MAX_DEFINITION_CHARS})` },
      { status: 413 }
    );
  }

  if (definition.length === 0) {
    // Empty submit = revert to the app default.
    await db
      .delete(glossaryTerms)
      .where(
        and(
          eq(glossaryTerms.termKey, termKey),
          eq(glossaryTerms.ownerEmail, ownerEmail)
        )
      );
    return Response.json({ ok: true, reverted: true });
  }

  await db
    .insert(glossaryTerms)
    .values({ termKey, definition, ownerEmail })
    .onConflictDoUpdate({
      target: [glossaryTerms.termKey, glossaryTerms.ownerEmail],
      set: { definition, updatedAt: new Date() },
    });

  return Response.json({ ok: true });
}
