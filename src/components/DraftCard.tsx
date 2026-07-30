"use client";

// Renders a ```draft block from the copilot as an actionable card:
// copy the plain text, or Accept & Create — which (with the teacher's
// explicit click, and only then) creates a Google Doc in the app's Drive
// folder for that grade/quarter, adds it to the material pool, and attaches
// it to the named lesson/unit when one resolves. See src/lib/draft-protocol.ts.

import { useState } from "react";
import type { ParsedDraft } from "@/lib/draft-protocol";

type CreateResult = {
  materialId: string;
  driveWebUrl: string | null;
  attached: { type: string; id: string; title: string } | null;
};

export default function DraftCard({
  draft,
  conversationId,
  streaming,
}: {
  draft: ParsedDraft;
  conversationId: string | null;
  streaming: boolean;
}) {
  const [copied, setCopied] = useState(false);
  const [creating, setCreating] = useState(false);
  const [result, setResult] = useState<CreateResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function copy() {
    try {
      await navigator.clipboard.writeText(draft.content);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Clipboard can be unavailable (permissions); the text is still
      // selectable in the pre below.
    }
  }

  async function acceptAndCreate() {
    if (creating || result) return;
    setCreating(true);
    setError(null);
    try {
      const res = await fetch("/api/copilot/accept-draft", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: draft.title,
          content: draft.content,
          materialType: draft.materialType,
          grade: draft.grade ?? undefined,
          quarter: draft.quarter ?? undefined,
          unitTitle: draft.unitTitle ?? undefined,
          lessonTitle: draft.lessonTitle ?? undefined,
          conversationId: conversationId ?? undefined,
        }),
      });
      if (!res.ok) {
        const body = (await res.json().catch(() => null)) as { error?: string } | null;
        throw new Error(body?.error ?? `Request failed (${res.status})`);
      }
      setResult((await res.json()) as CreateResult);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong");
    } finally {
      setCreating(false);
    }
  }

  const placement = draft.lessonTitle
    ? `Lesson: ${draft.lessonTitle}`
    : draft.unitTitle
      ? `Unit: ${draft.unitTitle}`
      : null;

  return (
    <div className="not-prose my-2 rounded-xl border border-emerald-300 dark:border-emerald-800 bg-emerald-50/50 dark:bg-emerald-950/30 overflow-hidden">
      {/* Header */}
      <div className="px-3 py-2 border-b border-emerald-200 dark:border-emerald-900 flex items-center justify-between gap-2">
        <div className="min-w-0">
          <div className="text-sm font-semibold text-zinc-900 dark:text-zinc-100 truncate">
            {draft.title}
          </div>
          <div className="text-xs text-zinc-500 dark:text-zinc-400 flex gap-2 flex-wrap">
            <span className="uppercase tracking-wide">{draft.materialType}</span>
            {draft.grade && <span>Grade {draft.grade}</span>}
            {draft.quarter && <span>{draft.quarter}</span>}
            {placement && <span className="truncate">{placement}</span>}
          </div>
        </div>
        <span className="text-[10px] font-medium uppercase tracking-wider text-emerald-700 dark:text-emerald-400 shrink-0">
          Draft
        </span>
      </div>

      {/* Content */}
      <pre className="px-3 py-2 text-xs leading-relaxed whitespace-pre-wrap max-h-72 overflow-y-auto text-zinc-800 dark:text-zinc-200 font-sans">
        {draft.content}
      </pre>

      {/* Actions */}
      <div className="px-3 py-2 border-t border-emerald-200 dark:border-emerald-900 flex items-center gap-2 flex-wrap">
        {result ? (
          <>
            <span className="text-xs text-emerald-700 dark:text-emerald-400 font-medium">
              ✓ Created{result.attached ? ` — attached to ${result.attached.title}` : " — added to your material pool"}
            </span>
            {result.driveWebUrl && (
              <a
                href={result.driveWebUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="text-xs underline text-zinc-700 dark:text-zinc-300 hover:text-zinc-900 dark:hover:text-zinc-100"
              >
                Open in Drive ↗
              </a>
            )}
          </>
        ) : (
          <>
            <button
              onClick={copy}
              disabled={streaming}
              className="text-xs px-2.5 py-1 rounded-md border border-zinc-300 dark:border-zinc-700 text-zinc-700 dark:text-zinc-300 hover:bg-zinc-100 dark:hover:bg-zinc-800 disabled:opacity-40 transition-colors"
            >
              {copied ? "Copied ✓" : "Copy text"}
            </button>
            <button
              onClick={acceptAndCreate}
              disabled={streaming || creating}
              className="text-xs px-2.5 py-1 rounded-md bg-emerald-700 hover:bg-emerald-800 text-white font-medium disabled:opacity-40 transition-colors"
            >
              {creating ? "Creating…" : "Accept & Create in Drive"}
            </button>
            <span className="text-[11px] text-zinc-400 dark:text-zinc-500">
              Nothing is saved to Drive until you accept.
            </span>
          </>
        )}
        {error && (
          <span className="text-xs text-red-600 dark:text-red-400 basis-full">
            {error} — you can try again or use Copy.
          </span>
        )}
      </div>
    </div>
  );
}
