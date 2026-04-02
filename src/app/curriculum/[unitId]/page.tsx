"use client";

import { useState, useEffect, useRef } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import ReactMarkdown from "react-markdown";
import {
  findUnit,
  updateUnit,
  type CurriculumUnit,
  type YearPlan,
} from "@/lib/curriculum-store";

export default function UnitDetailPage() {
  const { unitId } = useParams<{ unitId: string }>();
  const [unit, setUnit] = useState<CurriculumUnit | null>(null);
  const [plan, setPlan] = useState<YearPlan | null>(null);
  const [notes, setNotes] = useState("");
  const [lessonPlan, setLessonPlan] = useState("");
  const [generating, setGenerating] = useState(false);
  const notesRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    const result = findUnit(unitId);
    if (result) {
      setUnit(result.unit);
      setPlan(result.plan);
      setNotes(result.unit.notes ?? "");
      setLessonPlan(result.unit.lessonPlan ?? "");
    }
  }, [unitId]);

  function saveNotes() {
    if (!unit) return;
    updateUnit(unit.id, { notes });
  }

  async function generateLessonPlan() {
    if (!unit || !plan) return;
    setGenerating(true);
    setLessonPlan("");

    let accumulated = "";

    try {
      const res = await fetch("/api/curriculum", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          grade: plan.grade,
          theme: unit.title,
          weeks: unit.weeks,
          standards: unit.standards,
          context:
            unit.summary +
            (unit.notes ? `\n\nTeacher notes: ${unit.notes}` : ""),
        }),
      });

      if (!res.ok || !res.body) throw new Error(`API error ${res.status}`);

      const reader = res.body.getReader();
      const decoder = new TextDecoder();

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        accumulated += decoder.decode(value, { stream: true });
        setLessonPlan(accumulated);
      }

      updateUnit(unit.id, { lessonPlan: accumulated });
    } catch (err) {
      setLessonPlan("Something went wrong. Please try again.");
      console.error(err);
    } finally {
      setGenerating(false);
    }
  }

  if (!unit || !plan) {
    return (
      <div className="min-h-screen bg-zinc-50 dark:bg-zinc-950 flex items-center justify-center">
        <p className="text-sm text-zinc-400">
          Unit not found.{" "}
          <Link href="/curriculum" className="underline">
            Back to Year Planner
          </Link>
        </p>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-zinc-50 dark:bg-zinc-950">
      {/* Header */}
      <header className="border-b border-zinc-200 dark:border-zinc-800 px-6 py-4 bg-white dark:bg-zinc-900">
        <div className="max-w-4xl mx-auto flex items-center justify-between">
          <div className="flex items-center gap-3 min-w-0">
            <Link
              href="/curriculum"
              className="text-sm text-zinc-400 hover:text-zinc-700 dark:hover:text-zinc-300 transition-colors shrink-0"
            >
              ← Year Plan
            </Link>
            <span className="text-zinc-300 dark:text-zinc-700">/</span>
            <span className="text-sm text-zinc-600 dark:text-zinc-400 truncate">
              {unit.title}
            </span>
          </div>
          <span className="text-xs text-zinc-400 shrink-0 ml-4">
            Grade {plan.grade} · {unit.weeks} weeks
          </span>
        </div>
      </header>

      <div className="max-w-4xl mx-auto px-6 py-8 space-y-6">
        {/* ── Unit summary ──────────────────────────────────────────────────── */}
        <div className="bg-white dark:bg-zinc-900 rounded-xl border border-zinc-200 dark:border-zinc-800 p-6 space-y-4">
          <h1 className="text-xl font-semibold text-zinc-900 dark:text-zinc-50">
            {unit.title}
          </h1>
          <p className="text-sm text-zinc-600 dark:text-zinc-400 leading-relaxed">
            {unit.summary}
          </p>
          {unit.anchorTexts && (
            <p className="text-sm">
              <span className="font-medium text-zinc-700 dark:text-zinc-300">
                Anchor texts:{" "}
              </span>
              <span className="text-zinc-500 dark:text-zinc-400">
                {unit.anchorTexts}
              </span>
            </p>
          )}
          <p className="text-sm">
            <span className="font-medium text-zinc-700 dark:text-zinc-300">
              Standards:{" "}
            </span>
            <span className="text-zinc-500 dark:text-zinc-400">
              {unit.standards}
            </span>
          </p>
          {unit.flags && unit.flags !== "None" && (
            <div className="rounded-lg bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-800 px-4 py-3 text-sm text-amber-700 dark:text-amber-400">
              ⚠ {unit.flags}
            </div>
          )}
        </div>

        {/* ── Teacher notes ─────────────────────────────────────────────────── */}
        <div className="bg-white dark:bg-zinc-900 rounded-xl border border-zinc-200 dark:border-zinc-800 p-6 space-y-3">
          <div>
            <h2 className="text-sm font-semibold text-zinc-700 dark:text-zinc-300">
              Teacher Notes
            </h2>
            <p className="text-xs text-zinc-400 mt-0.5">
              Saved here and fed back into future planning — student reactions, pacing issues, what to change
            </p>
          </div>
          <textarea
            ref={notesRef}
            rows={3}
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            onBlur={saveNotes}
            placeholder="e.g. Students struggled with the ambiguous ending. Several found the content unsettling — consider a trigger warning or alternative text next year."
            className="w-full resize-none rounded-lg border border-zinc-300 dark:border-zinc-700 bg-zinc-50 dark:bg-zinc-800 px-3 py-2 text-sm text-zinc-900 dark:text-zinc-100 placeholder-zinc-400 focus:outline-none focus:ring-2 focus:ring-zinc-900 dark:focus:ring-zinc-100"
          />
          <button
            onClick={saveNotes}
            className="text-xs text-zinc-400 hover:text-zinc-700 dark:hover:text-zinc-300 transition-colors"
          >
            Save notes
          </button>
        </div>

        {/* ── Lesson plan ───────────────────────────────────────────────────── */}
        <div className="bg-white dark:bg-zinc-900 rounded-xl border border-zinc-200 dark:border-zinc-800 p-6 space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-sm font-semibold text-zinc-700 dark:text-zinc-300">
                Lesson Sequence
              </h2>
              <p className="text-xs text-zinc-400 mt-0.5">
                Week-by-week lesson breakdown for this unit
              </p>
            </div>
            {lessonPlan && !generating && (
              <button
                onClick={generateLessonPlan}
                className="text-xs text-zinc-400 hover:text-zinc-700 dark:hover:text-zinc-300 transition-colors"
              >
                Regenerate
              </button>
            )}
          </div>

          {!lessonPlan && !generating && (
            <button
              onClick={generateLessonPlan}
              className="w-full h-11 rounded-xl bg-zinc-900 dark:bg-zinc-100 text-white dark:text-zinc-900 text-sm font-medium hover:bg-zinc-700 dark:hover:bg-zinc-300 transition-colors"
            >
              Generate Lesson Sequence
            </button>
          )}

          {generating && !lessonPlan && (
            <div className="flex items-center gap-2 text-sm text-zinc-400">
              <span className="inline-block w-1.5 h-4 bg-zinc-400 animate-pulse" />
              Building lesson sequence...
            </div>
          )}

          {lessonPlan && (
            <div className="prose prose-zinc dark:prose-invert max-w-none text-sm leading-relaxed">
              <ReactMarkdown>{lessonPlan}</ReactMarkdown>
              {generating && (
                <span className="inline-block w-1.5 h-4 ml-0.5 bg-zinc-400 animate-pulse align-middle" />
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
