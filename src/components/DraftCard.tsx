"use client";

// Renders a ```draft block from the copilot as an actionable card:
// copy the plain text, or Accept & Create — which (with the teacher's
// explicit click, and only then) creates a Google Doc in the app's Drive
// folder for that grade/quarter, adds it to the material pool, and attaches
// it to the named lesson/unit when one resolves. See src/lib/draft-protocol.ts.

import { useState } from "react";
import type { ParsedDraft } from "@/lib/draft-protocol";
import { parseSlideOutline, parseTsv } from "@/lib/draft-formats";

// What the buttons promise. The label has to name the real artifact — "Accept
// & Create in Drive" on something that becomes a spreadsheet tells her nothing
// about what she is about to get.
const FORMAT_UI = {
  doc: { noun: "Doc", action: "Accept & Create in Drive" },
  sheet: { noun: "Sheet", action: "Accept & Create Sheet" },
  slides: { noun: "Slides", action: "Accept & Create Slides" },
} as const;

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
          format: draft.format,
          materialType: draft.materialType,
          grade: draft.grade ?? undefined,
          quarter: draft.quarter ?? undefined,
          unitTitle: draft.unitTitle ?? undefined,
          lessonTitle: draft.lessonTitle ?? undefined,
          conversationId: conversationId ?? undefined,
          // Present when the copilot proposed through a tool call. Carries the
          // styling — background, fonts, colours — that plain text could not.
          spec: draft.spec ?? undefined,
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

  const ui = FORMAT_UI[draft.format];

  // Show her the shape she is accepting. A curriculum map as tab-separated
  // text looks broken even when it is perfectly correct; as a table it looks
  // like the thing it will become.
  const grid = draft.format === "sheet" ? parseTsv(draft.content) : [];
  const outline = draft.format === "slides" ? parseSlideOutline(draft.content) : [];

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
            <span className="uppercase tracking-wide text-emerald-700 dark:text-emerald-400">
              {ui.noun}
            </span>
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
      {draft.format === "sheet" && grid.length > 0 ? (
        <div className="max-h-72 overflow-auto">
          <table className="text-[11px] border-collapse w-full">
            <thead className="sticky top-0 bg-emerald-100/80 dark:bg-emerald-900/50">
              <tr>
                {grid[0].map((cell, i) => (
                  <th
                    key={i}
                    className="border border-emerald-200 dark:border-emerald-900 px-2 py-1 text-left font-semibold align-top text-zinc-800 dark:text-zinc-200"
                  >
                    {cell}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {grid.slice(1).map((row, r) => (
                <tr key={r}>
                  {row.map((cell, c) => (
                    <td
                      key={c}
                      className="border border-emerald-200 dark:border-emerald-900 px-2 py-1 align-top text-zinc-700 dark:text-zinc-300"
                    >
                      {cell}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : draft.format === "slides" && outline.length > 0 ? (
        <ol className="px-3 py-2 max-h-72 overflow-y-auto space-y-2 text-xs">
          {outline.map((slide, i) => (
            <li key={i} className="flex gap-2">
              <span className="text-[10px] text-emerald-700 dark:text-emerald-400 font-mono pt-0.5 shrink-0">
                {i + 1}
              </span>
              <div className="min-w-0">
                <div className="font-semibold text-zinc-900 dark:text-zinc-100">
                  {slide.title}
                </div>
                {slide.bullets.length > 0 && (
                  <ul className="list-disc list-inside text-zinc-600 dark:text-zinc-400">
                    {slide.bullets.map((b, j) => (
                      <li key={j}>{b}</li>
                    ))}
                  </ul>
                )}
              </div>
            </li>
          ))}
        </ol>
      ) : (
        <pre className="px-3 py-2 text-xs leading-relaxed whitespace-pre-wrap max-h-72 overflow-y-auto text-zinc-800 dark:text-zinc-200 font-sans">
          {draft.content}
        </pre>
      )}

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
              {creating ? "Creating…" : ui.action}
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
