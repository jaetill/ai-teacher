// GET /api/health — the one unauthenticated endpoint an uptime checker can hit.
//
// Answers two questions: is the function alive, and can it reach Postgres.
// Nothing else — no row counts, no env dump, no version of anything a scanner
// could use. `release` is the deploy SHA so a checker's "it's down" can be
// matched to a deploy without opening Vercel.
//
// 200 { ok: true }   — app up, DB reachable
// 503 { ok: false }  — app up, DB not reachable (Neon down, bad DATABASE_URL)
// anything else      — app down; Vercel itself is answering
//
// deploy-prod.yml polls this after every production deploy.
import { sql } from "drizzle-orm";
import { db } from "@/db";

export const dynamic = "force-dynamic";

export async function GET(): Promise<Response> {
  const started = Date.now();
  let dbOk = false;
  try {
    await db.execute(sql`select 1`);
    dbOk = true;
  } catch (err) {
    console.error("[health] db check failed:", err instanceof Error ? err.message : err);
  }
  const body = {
    ok: dbOk,
    db: dbOk,
    dbMs: Date.now() - started,
    release: process.env.VERCEL_GIT_COMMIT_SHA?.slice(0, 7) ?? null,
    time: new Date().toISOString(),
  };
  return Response.json(body, {
    status: dbOk ? 200 : 503,
    headers: { "Cache-Control": "no-store" },
  });
}
