// POST /api/feedback - user feedback widget endpoint (Standard 11 / ADR-0012).
// Files a GitHub Issue against jaetill/ai-teacher.
//
// Env vars (set in Vercel):
//   GITHUB_TOKEN        - PAT with issues:write on jaetill/ai-teacher
//   GITHUB_REPO_OWNER   - defaults to "jaetill"
//   GITHUB_REPO_NAME    - defaults to "ai-teacher"
//   KV_REST_API_URL     - Vercel KV REST endpoint (rate limiting)
//   KV_REST_API_TOKEN   - Vercel KV REST token

import { NextRequest } from "next/server";
import { Octokit } from "@octokit/rest";
import { kv } from "@vercel/kv";

const REPO_OWNER = process.env.GITHUB_REPO_OWNER || "jaetill";
const REPO_NAME = process.env.GITHUB_REPO_NAME || "ai-teacher";

const ALLOWED_TYPES = new Set(["bug", "feature", "other"]);
const WINDOW_SECS = 60 * 60;
const LIMIT = 10;

// Fleet-wide rate limit via Vercel KV (Redis INCR + EXPIRE).
// Fixes the per-instance limitation of the previous in-memory Map — each serverless
// instance incremented its own counter independently, making the 10/hour ceiling
// multiply by the number of warm instances.
async function checkRateLimit(ip: string): Promise<{ allowed: boolean; retryAfter?: number }> {
  const key = `rl:fb:${ip}`;
  const count = await kv.incr(key);
  if (count === 1) {
    // First request in the window — attach TTL atomically before any concurrent INCR.
    await kv.expire(key, WINDOW_SECS);
  }
  if (count > LIMIT) {
    const ttl = await kv.ttl(key);
    return { allowed: false, retryAfter: ttl > 0 ? ttl : WINDOW_SECS };
  }
  return { allowed: true };
}

function escapeMarkdown(str: string): string {
  return str.replace(/[\\*_#[\]`<>!]/g, "\\$&");
}

interface FeedbackBody {
  type?: string;
  description?: string;
  email?: string;
  page_url?: string;
  user_agent?: string;
  website?: string;
}

function validate(input: FeedbackBody): string | null {
  if (!input || typeof input !== "object") return "body must be an object";
  if (typeof input.type !== "string" || !ALLOWED_TYPES.has(input.type)) {
    return "type must be one of: bug, feature, other";
  }
  if (typeof input.description !== "string") return "description must be a string";
  if (input.description.length < 10 || input.description.length > 2000) {
    return "description must be 10-2000 characters";
  }
  if (input.email !== undefined) {
    if (typeof input.email !== "string" || !input.email.includes("@") || input.email.length > 254) {
      return "email must be a valid email address";
    }
  }
  return null;
}

export async function POST(request: NextRequest) {
  const ip = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "unknown";

  const rl = await checkRateLimit(ip);
  if (!rl.allowed) {
    return Response.json(
      { error: "rate_limited", retry_after_seconds: rl.retryAfter },
      { status: 429, headers: { "Retry-After": String(rl.retryAfter) } },
    );
  }

  let body: FeedbackBody;
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "invalid_json" }, { status: 400 });
  }

  // Honeypot
  if (typeof body.website === "string" && body.website.length > 0) {
    return Response.json({ id: `FB-DROPPED-${Date.now()}`, status: "received" }, { status: 201 });
  }

  const violation = validate(body);
  if (violation) {
    return Response.json({ error: "validation_error", detail: violation }, { status: 400 });
  }

  const token = process.env.GITHUB_TOKEN;
  if (!token) {
    console.error("feedback.config_missing: GITHUB_TOKEN env var not set");
    return Response.json({ error: "configuration_error" }, { status: 500 });
  }

  const titleBody =
    body.description!.length > 60 ? body.description!.slice(0, 60).trim() + "..." : body.description!;
  const issueTitle = `[${body.type}] ${escapeMarkdown(titleBody)}`;
  const issueBody = [
    "## Description",
    escapeMarkdown(body.description!),
    "",
    "## Context",
    body.page_url ? `- Page: ${escapeMarkdown(body.page_url)}` : null,
    body.user_agent ? `- UA: ${escapeMarkdown(body.user_agent)}` : null,
    body.email ? `- Email: ${escapeMarkdown(body.email)}` : null,
  ]
    .filter(Boolean)
    .join("\n");

  try {
    const octokit = new Octokit({ auth: token });
    const result = await octokit.rest.issues.create({
      owner: REPO_OWNER,
      repo: REPO_NAME,
      title: issueTitle,
      body: issueBody,
      labels: ["feedback:user-submitted", `type:${body.type}`],
    });
    const id = `FB-${new Date().getFullYear()}-${String(result.data.number).padStart(6, "0")}`;
    console.log("feedback.received", { id, type: body.type, issue_number: result.data.number });
    return Response.json({ id, status: "received" }, { status: 201 });
  } catch (err) {
    const e = err as Error & { status?: number };
    console.error("feedback.github_failed", { error: e.message, status: e.status });
    return Response.json({ error: "github_issue_creation_failed" }, { status: 502 });
  }
}