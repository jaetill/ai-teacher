"use client";

// Quote-anchored question writer (#679).
//
// The interaction Heidi taught herself in Copilot, made native: choose the text
// the questions must come from, name the kinds of question you want, get items
// back with the supporting quote printed beside each one.
//
// Three constraints from the corpus shape this UI:
//   1. Plain, copy-paste output — the interactive quiz widget failed her six
//      times, twice costing whole turns just to read her own questions.
//   2. The evidence is visible next to every item, because the failure she
//      cannot audit is a confident fabrication about her own book.
//   3. Anything the server rejected is shown, not hidden. "I dropped 2 that
//      weren't in your passage" is information she needs to trust the rest.

import { useState } from "react";
import { ITEM_TYPES, type ItemType, type ItemFormat, MAX_ITEMS } from "@/lib/items";

type Material = {
  materialId: string;
  title: string;
  materialType: string;
};

type Item = {
  type: ItemType;
  question: string;
  choices: string[];
  answerIndex: number | null;
  answer: string | null;
  evidence: string;
};

type Result = {
  items: Item[];
  dropped: { question: string; reason: string }[];
  truncated: boolean;
  sourceTitle: string | null;
  plainText: string;
  studentText: string;
};

const LETTERS = "ABCDEFGH";

export default function ItemWriter({
  lessonId,
  materials,
}: {
  lessonId: string;
  materials: Material[];
}) {
  const [open, setOpen] = useState(false);
  const [materialId, setMaterialId] = useState<string>("");
  const [passage, setPassage] = useState("");
  const [types, setTypes] = useState<ItemType[]>(["comprehension", "inferential"]);
  const [count, setCount] = useState(5);
  const [format, setFormat] = useState<ItemFormat>("multiple_choice");

  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<Result | null>(null);
  const [showKey, setShowKey] = useState(true);
  const [copied, setCopied] = useState(false);

  function toggleType(t: ItemType) {
    setTypes((prev) => (prev.includes(t) ? prev.filter((x) => x !== t) : [...prev, t]));
  }

  async function generate() {
    setBusy(true);
    setError(null);
    setResult(null);
    try {
      const res = await fetch(`/api/lessons/${lessonId}/items`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          materialId: materialId || undefined,
          passage: materialId ? undefined : passage,
          types,
          count,
          format,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Could not write questions");
      setResult(data);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not write questions");
    } finally {
      setBusy(false);
    }
  }

  async function copyOut() {
    if (!result) return;
    await navigator.clipboard.writeText(showKey ? result.plainText : result.studentText);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  if (!open) {
    return (
      <button
        onClick={() => setOpen(true)}
        className="mt-3 rounded-md border border-zinc-300 px-3 py-1.5 text-sm font-medium text-zinc-700 hover:bg-zinc-50 dark:border-zinc-700 dark:text-zinc-200 dark:hover:bg-zinc-900"
      >
        Write questions from a passage
      </button>
    );
  }

  return (
    <section className="mt-3 rounded-lg border border-zinc-200 p-4 dark:border-zinc-800">
      <div className="mb-3 flex items-start justify-between gap-4">
        <div>
          <h3 className="font-medium text-zinc-900 dark:text-zinc-100">
            Write questions from a passage
          </h3>
          <p className="mt-0.5 text-xs text-zinc-500">
            Questions come only from the text you choose. Anything not supported by it is thrown
            away before you see it.
          </p>
        </div>
        <button
          onClick={() => setOpen(false)}
          className="shrink-0 text-sm text-zinc-600 hover:underline dark:text-zinc-400"
        >
          Done
        </button>
      </div>

      {materials.length > 0 && (
        <label className="block text-sm">
          <span className="text-zinc-700 dark:text-zinc-300">Use a file from this lesson</span>
          <select
            value={materialId}
            onChange={(e) => setMaterialId(e.target.value)}
            className="mt-1 w-full rounded-md border border-zinc-300 px-2 py-1.5 text-sm dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-100"
          >
            <option value="">— paste a passage instead —</option>
            {materials.map((m) => (
              <option key={m.materialId} value={m.materialId}>
                {m.title}
              </option>
            ))}
          </select>
        </label>
      )}

      {!materialId && (
        <label className="mt-3 block text-sm">
          <span className="text-zinc-700 dark:text-zinc-300">Passage</span>
          <textarea
            value={passage}
            onChange={(e) => setPassage(e.target.value)}
            rows={6}
            placeholder="Paste the paragraphs the questions should come from…"
            className="mt-1 w-full rounded-md border border-zinc-300 px-2 py-1.5 text-sm dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-100"
          />
        </label>
      )}

      <fieldset className="mt-3">
        <legend className="text-sm text-zinc-700 dark:text-zinc-300">Question types</legend>
        <div className="mt-1 flex flex-wrap gap-2">
          {ITEM_TYPES.map((t) => (
            <button
              key={t.value}
              onClick={() => toggleType(t.value)}
              aria-pressed={types.includes(t.value)}
              className={`rounded-full border px-3 py-1 text-xs ${
                types.includes(t.value)
                  ? "border-blue-600 bg-blue-600 text-white"
                  : "border-zinc-300 text-zinc-700 hover:bg-zinc-50 dark:border-zinc-700 dark:text-zinc-300 dark:hover:bg-zinc-900"
              }`}
            >
              {t.label}
            </button>
          ))}
        </div>
      </fieldset>

      <div className="mt-3 flex flex-wrap items-end gap-3">
        <label className="text-sm">
          <span className="text-zinc-700 dark:text-zinc-300">How many</span>
          <input
            type="number"
            min={1}
            max={MAX_ITEMS}
            value={count}
            onChange={(e) => setCount(Number(e.target.value))}
            className="mt-1 w-20 rounded-md border border-zinc-300 px-2 py-1.5 text-sm dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-100"
          />
        </label>
        <label className="text-sm">
          <span className="text-zinc-700 dark:text-zinc-300">Format</span>
          <select
            value={format}
            onChange={(e) => setFormat(e.target.value as ItemFormat)}
            className="mt-1 rounded-md border border-zinc-300 px-2 py-1.5 text-sm dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-100"
          >
            <option value="multiple_choice">Multiple choice</option>
            <option value="short_answer">Short answer</option>
          </select>
        </label>
        <button
          onClick={generate}
          disabled={busy || types.length === 0}
          className="rounded-md bg-blue-600 px-3 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50"
        >
          {busy ? "Writing…" : "Write questions"}
        </button>
      </div>

      {error && (
        <p className="mt-3 rounded-md border border-amber-300 bg-amber-50 px-3 py-2 text-sm text-amber-900 dark:border-amber-900 dark:bg-amber-950 dark:text-amber-200">
          {error}
        </p>
      )}

      {result && (
        <div className="mt-4">
          <div className="mb-2 flex flex-wrap items-center gap-3">
            <span className="text-sm text-zinc-600 dark:text-zinc-400">
              {result.items.length} question{result.items.length === 1 ? "" : "s"}
              {result.sourceTitle ? ` from ${result.sourceTitle}` : ""}
            </span>
            <label className="flex items-center gap-1 text-xs text-zinc-600 dark:text-zinc-400">
              <input
                type="checkbox"
                checked={showKey}
                onChange={(e) => setShowKey(e.target.checked)}
              />
              include answer key
            </label>
            <button
              onClick={copyOut}
              className="rounded-md border border-zinc-300 px-2 py-1 text-xs font-medium text-zinc-700 hover:bg-zinc-50 dark:border-zinc-700 dark:text-zinc-200 dark:hover:bg-zinc-900"
            >
              {copied ? "Copied" : "Copy for Google Docs"}
            </button>
          </div>

          {result.dropped.length > 0 && (
            <p className="mb-2 rounded-md border border-zinc-200 px-3 py-2 text-xs text-zinc-600 dark:border-zinc-800 dark:text-zinc-400">
              Threw away {result.dropped.length} question
              {result.dropped.length === 1 ? "" : "s"} that the passage didn&apos;t actually
              support: {result.dropped.map((d) => d.reason).join("; ")}.
            </p>
          )}
          {result.truncated && (
            <p className="mb-2 text-xs text-zinc-500">
              That file was long, so only the beginning was used. Paste a narrower passage to aim
              at a specific scene.
            </p>
          )}

          <ol className="space-y-3">
            {result.items.map((item, i) => (
              <li key={i} className="rounded-md border border-zinc-200 p-3 dark:border-zinc-800">
                <p className="text-sm text-zinc-900 dark:text-zinc-100">
                  {i + 1}. {item.question}
                </p>
                {item.choices.length > 0 && (
                  <ul className="mt-1 space-y-0.5">
                    {item.choices.map((c, j) => (
                      <li
                        key={j}
                        className={`text-sm ${
                          showKey && j === item.answerIndex
                            ? "font-medium text-green-700 dark:text-green-400"
                            : "text-zinc-700 dark:text-zinc-300"
                        }`}
                      >
                        {LETTERS[j]}. {c}
                      </li>
                    ))}
                  </ul>
                )}
                {showKey && item.answer && (
                  <p className="mt-1 text-sm text-green-700 dark:text-green-400">{item.answer}</p>
                )}
                {/* The anchor: what in her text justifies this question. */}
                <p className="mt-2 border-l-2 border-zinc-300 pl-2 text-xs italic text-zinc-500 dark:border-zinc-700">
                  &ldquo;{item.evidence}&rdquo;
                </p>
              </li>
            ))}
          </ol>
        </div>
      )}
    </section>
  );
}
