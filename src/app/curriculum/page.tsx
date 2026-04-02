"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import ReactMarkdown from "react-markdown";
import {
  saveYearPlan,
  loadYearPlan,
  type YearPlan,
  type CurriculumUnit,
} from "@/lib/curriculum-store";

interface FormState {
  grade: string;
  schoolYear: string;
  standards: string;
  existingCurriculum: string;
  notes: string;
}

const currentYear = new Date().getFullYear();

const emptyForm: FormState = {
  grade: "",
  schoolYear: `${currentYear}-${currentYear + 1}`,
  standards: "",
  existingCurriculum: "",
  notes: "",
};

// ── Parse units from streamed response ───────────────────────────────────────

const SENTINEL = "\n---UNITS---\n";

function splitOutput(raw: string): { display: string; json: string | null } {
  const idx = raw.lastIndexOf(SENTINEL);
  if (idx === -1) return { display: raw, json: null };
  return {
    display: raw.substring(0, idx),
    json: raw.substring(idx + SENTINEL.length).trim(),
  };
}

function parseUnits(json: string): CurriculumUnit[] {
  const parsed = JSON.parse(json) as Array<{
    title: string;
    weeks: number;
    standards: string;
    summary: string;
    anchorTexts: string;
    flags: string;
  }>;
  return parsed.map((u, i) => ({
    id: crypto.randomUUID(),
    index: i,
    title: u.title,
    weeks: Number(u.weeks),
    standards: u.standards ?? "",
    summary: u.summary ?? "",
    anchorTexts: u.anchorTexts ?? "",
    flags: u.flags ?? "",
    notes: "",
  }));
}

// ── Component ─────────────────────────────────────────────────────────────────

export default function CurriculumPage() {
  const [form, setForm] = useState<FormState>(emptyForm);
  const [displayOutput, setDisplayOutput] = useState("");
  const [units, setUnits] = useState<CurriculumUnit[]>([]);
  const [generating, setGenerating] = useState(false);
  const [hasGenerated, setHasGenerated] = useState(false);
  const [savedPlan, setSavedPlan] = useState<YearPlan | null>(null);

  useEffect(() => {
    if (form.grade) {
      setSavedPlan(loadYearPlan(parseInt(form.grade)));
    } else {
      setSavedPlan(null);
    }
  }, [form.grade]);

  function update(field: keyof FormState, value: string) {
    setForm((prev) => ({ ...prev, [field]: value }));
  }

  function loadSaved() {
    if (!savedPlan) return;
    const { display } = splitOutput(savedPlan.rawPlan);
    setDisplayOutput(display);
    setUnits(savedPlan.units);
    setHasGenerated(true);
  }

  async function generate() {
    if (!form.grade || !form.schoolYear || !form.standards) return;
    setGenerating(true);
    setDisplayOutput("");
    setUnits([]);
    setHasGenerated(true);

    let accumulated = "";

    try {
      const res = await fetch("/api/year-plan", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          grade: parseInt(form.grade),
          schoolYear: form.schoolYear,
          standards: form.standards,
          existingCurriculum: form.existingCurriculum || undefined,
          notes: form.notes || undefined,
        }),
      });

      if (!res.ok || !res.body) throw new Error(`API error ${res.status}`);

      const reader = res.body.getReader();
      const decoder = new TextDecoder();

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        accumulated += decoder.decode(value, { stream: true });
        setDisplayOutput(splitOutput(accumulated).display);
      }

      // Parse and save after stream completes
      const { json } = splitOutput(accumulated);
      if (json) {
        const parsedUnits = parseUnits(json);
        setUnits(parsedUnits);
        saveYearPlan({
          grade: parseInt(form.grade),
          schoolYear: form.schoolYear,
          rawPlan: accumulated,
          units: parsedUnits,
          createdAt: new Date().toISOString(),
        });
      }
    } catch (err) {
      setDisplayOutput("Something went wrong. Please try again.");
      console.error(err);
    } finally {
      setGenerating(false);
    }
  }

  function reset() {
    setForm(emptyForm);
    setDisplayOutput("");
    setUnits([]);
    setHasGenerated(false);
    setSavedPlan(null);
  }

  const canGenerate =
    form.grade && form.schoolYear && form.standards && !generating;

  return (
    <div className="min-h-screen bg-zinc-50 dark:bg-zinc-950">
      {/* Header */}
      <header className="border-b border-zinc-200 dark:border-zinc-800 px-6 py-4 bg-white dark:bg-zinc-900">
        <div className="max-w-4xl mx-auto flex items-center justify-between">
          <div>
            <h1 className="text-lg font-semibold text-zinc-900 dark:text-zinc-50">
              Curriculum Compiler
            </h1>
            <p className="text-sm text-zinc-500 dark:text-zinc-400">
              Plan your year, then expand each unit into a full lesson sequence
            </p>
          </div>
          {hasGenerated && (
            <button
              onClick={reset}
              className="text-sm text-zinc-500 hover:text-zinc-900 dark:hover:text-zinc-100 transition-colors"
            >
              New plan
            </button>
          )}
        </div>
      </header>

      <div className="max-w-4xl mx-auto px-6 py-8 space-y-6">
        {/* ── Form ──────────────────────────────────────────────────────────── */}
        {!hasGenerated && (
          <div className="bg-white dark:bg-zinc-900 rounded-xl border border-zinc-200 dark:border-zinc-800 p-6 space-y-5">
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <label className="text-sm font-medium text-zinc-700 dark:text-zinc-300">
                  Grade
                </label>
                <select
                  value={form.grade}
                  onChange={(e) => update("grade", e.target.value)}
                  className="w-full rounded-lg border border-zinc-300 dark:border-zinc-700 bg-zinc-50 dark:bg-zinc-800 px-3 py-2 text-sm text-zinc-900 dark:text-zinc-100 focus:outline-none focus:ring-2 focus:ring-zinc-900 dark:focus:ring-zinc-100"
                >
                  <option value="">Select grade</option>
                  <option value="6">Grade 6</option>
                  <option value="7">Grade 7</option>
                  <option value="8">Grade 8</option>
                </select>
              </div>
              <div className="space-y-1.5">
                <label className="text-sm font-medium text-zinc-700 dark:text-zinc-300">
                  School Year
                </label>
                <input
                  type="text"
                  value={form.schoolYear}
                  onChange={(e) => update("schoolYear", e.target.value)}
                  className="w-full rounded-lg border border-zinc-300 dark:border-zinc-700 bg-zinc-50 dark:bg-zinc-800 px-3 py-2 text-sm text-zinc-900 dark:text-zinc-100 focus:outline-none focus:ring-2 focus:ring-zinc-900 dark:focus:ring-zinc-100"
                />
              </div>
            </div>

            {/* Saved plan banner */}
            {savedPlan && (
              <div className="flex items-center justify-between rounded-lg bg-zinc-50 dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700 px-4 py-3 text-sm">
                <span className="text-zinc-500 dark:text-zinc-400">
                  Saved plan for Grade {savedPlan.grade} ({savedPlan.schoolYear})
                </span>
                <button
                  onClick={loadSaved}
                  className="font-medium text-zinc-900 dark:text-zinc-100 hover:underline"
                >
                  Load it
                </button>
              </div>
            )}

            <div className="space-y-1.5">
              <label className="text-sm font-medium text-zinc-700 dark:text-zinc-300">
                Standards
              </label>
              <p className="text-xs text-zinc-400">
                Paste your full standards list for the year
              </p>
              <textarea
                rows={6}
                value={form.standards}
                onChange={(e) => update("standards", e.target.value)}
                placeholder="Paste your ELA standards here — CCSS codes, state standards, or plain descriptions"
                className="w-full resize-none rounded-lg border border-zinc-300 dark:border-zinc-700 bg-zinc-50 dark:bg-zinc-800 px-3 py-2 text-sm text-zinc-900 dark:text-zinc-100 placeholder-zinc-400 focus:outline-none focus:ring-2 focus:ring-zinc-900 dark:focus:ring-zinc-100"
              />
            </div>

            <div className="space-y-1.5">
              <label className="text-sm font-medium text-zinc-700 dark:text-zinc-300">
                Existing Curriculum{" "}
                <span className="font-normal text-zinc-400">(optional)</span>
              </label>
              <p className="text-xs text-zinc-400">
                Paste your current curriculum — Claude will review it and suggest improvements
              </p>
              <textarea
                rows={4}
                value={form.existingCurriculum}
                onChange={(e) => update("existingCurriculum", e.target.value)}
                placeholder="Paste your existing unit list, pacing guide, or curriculum overview"
                className="w-full resize-none rounded-lg border border-zinc-300 dark:border-zinc-700 bg-zinc-50 dark:bg-zinc-800 px-3 py-2 text-sm text-zinc-900 dark:text-zinc-100 placeholder-zinc-400 focus:outline-none focus:ring-2 focus:ring-zinc-900 dark:focus:ring-zinc-100"
              />
            </div>

            <div className="space-y-1.5">
              <label className="text-sm font-medium text-zinc-700 dark:text-zinc-300">
                Notes from this year{" "}
                <span className="font-normal text-zinc-400">(optional)</span>
              </label>
              <p className="text-xs text-zinc-400">
                What worked, what didn&apos;t, student reactions — feeds into next year&apos;s recommendations
              </p>
              <textarea
                rows={3}
                value={form.notes}
                onChange={(e) => update("notes", e.target.value)}
                placeholder="e.g. Refugee caused significant emotional distress for several students. Poetry unit ran 2 weeks over. Students struggled with argumentative writing."
                className="w-full resize-none rounded-lg border border-zinc-300 dark:border-zinc-700 bg-zinc-50 dark:bg-zinc-800 px-3 py-2 text-sm text-zinc-900 dark:text-zinc-100 placeholder-zinc-400 focus:outline-none focus:ring-2 focus:ring-zinc-900 dark:focus:ring-zinc-100"
              />
            </div>

            <button
              onClick={generate}
              disabled={!canGenerate}
              className="w-full h-11 rounded-xl bg-zinc-900 dark:bg-zinc-100 text-white dark:text-zinc-900 text-sm font-medium disabled:opacity-40 hover:bg-zinc-700 dark:hover:bg-zinc-300 transition-colors"
            >
              Generate Year Plan
            </button>
          </div>
        )}

        {/* ── Output ────────────────────────────────────────────────────────── */}
        {hasGenerated && (
          <>
            <div className="bg-white dark:bg-zinc-900 rounded-xl border border-zinc-200 dark:border-zinc-800 p-6">
              {generating && !displayOutput && (
                <div className="flex items-center gap-2 text-sm text-zinc-400">
                  <span className="inline-block w-1.5 h-4 bg-zinc-400 animate-pulse" />
                  Planning your year...
                </div>
              )}
              <div className="prose prose-zinc dark:prose-invert max-w-none text-sm leading-relaxed">
                <ReactMarkdown>{displayOutput}</ReactMarkdown>
                {generating && displayOutput && (
                  <span className="inline-block w-1.5 h-4 ml-0.5 bg-zinc-400 animate-pulse align-middle" />
                )}
              </div>
            </div>

            {/* Unit cards */}
            {units.length > 0 && (
              <div className="space-y-3">
                <h2 className="text-xs font-semibold text-zinc-400 dark:text-zinc-500 uppercase tracking-wider">
                  Click a unit to expand into a full lesson sequence
                </h2>
                <div className="grid gap-3">
                  {units.map((unit, i) => (
                    <Link
                      key={unit.id}
                      href={`/curriculum/${unit.id}`}
                      className="block bg-white dark:bg-zinc-900 rounded-xl border border-zinc-200 dark:border-zinc-800 px-5 py-4 hover:border-zinc-400 dark:hover:border-zinc-600 transition-colors"
                    >
                      <div className="flex items-start justify-between gap-4">
                        <div className="min-w-0">
                          <div className="text-xs text-zinc-400 mb-1">
                            Unit {i + 1} · {unit.weeks} weeks
                          </div>
                          <div className="text-sm font-medium text-zinc-900 dark:text-zinc-50">
                            {unit.title}
                          </div>
                          <div className="text-sm text-zinc-500 dark:text-zinc-400 mt-1 line-clamp-2">
                            {unit.summary}
                          </div>
                          {unit.flags && unit.flags !== "None" && (
                            <div className="mt-2 text-xs text-amber-600 dark:text-amber-400">
                              ⚠ {unit.flags}
                            </div>
                          )}
                        </div>
                        <span className="text-zinc-400 text-sm shrink-0">→</span>
                      </div>
                    </Link>
                  ))}
                </div>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
