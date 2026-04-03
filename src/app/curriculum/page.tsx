"use client";

import { useState, useEffect, useCallback } from "react";
import Link from "next/link";
import ReactMarkdown from "react-markdown";

// ── Types ───

type UnitSummary = {
  id: string;
  title: string;
  sortOrder: number;
  quarter: string | null;
  durationWeeks: number;
  summary: string;
  contentWarnings: string | null;
  source: string;
};

type Course = {
  id: string;
  title: string;
  grade: number;
  units: UnitSummary[];
};

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

// ── Parse units from streamed response ───

const SENTINEL = "\n---UNITS---\n";

function splitOutput(raw: string): { display: string; json: string | null } {
  const idx = raw.lastIndexOf(SENTINEL);
  if (idx === -1) return { display: raw, json: null };
  return {
    display: raw.substring(0, idx),
    json: raw.substring(idx + SENTINEL.length).trim(),
  };
}

// ── Quarter styles (shared with editor) ───

const QUARTER_STYLES: Record<string, { border: string; badge: string; accent: string }> = {
  Q1: {
    border: "border-l-blue-400 dark:border-l-blue-500",
    badge: "bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300",
    accent: "hover:border-blue-200 dark:hover:border-blue-800",
  },
  Q2: {
    border: "border-l-violet-400 dark:border-l-violet-500",
    badge: "bg-violet-100 text-violet-700 dark:bg-violet-900/40 dark:text-violet-300",
    accent: "hover:border-violet-200 dark:hover:border-violet-800",
  },
  Q3: {
    border: "border-l-teal-400 dark:border-l-teal-500",
    badge: "bg-teal-100 text-teal-700 dark:bg-teal-900/40 dark:text-teal-300",
    accent: "hover:border-teal-200 dark:hover:border-teal-800",
  },
  Q4: {
    border: "border-l-amber-400 dark:border-l-amber-500",
    badge: "bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300",
    accent: "hover:border-amber-200 dark:hover:border-amber-800",
  },
};

// ── Component ───

export default function CurriculumPage() {
  const [courses, setCourses] = useState<Course[]>([]);
  const [schoolYear, setSchoolYear] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState<FormState>(emptyForm);
  const [displayOutput, setDisplayOutput] = useState("");
  const [generating, setGenerating] = useState(false);

  const fetchCourses = useCallback(async () => {
    try {
      const res = await fetch("/api/courses");
      const data = await res.json();
      setCourses(data.courses ?? []);
      setSchoolYear(data.schoolYear ?? null);
    } catch (err) {
      console.error("Failed to load courses", err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchCourses();
  }, [fetchCourses]);

  function update(field: keyof FormState, value: string) {
    setForm((prev) => ({ ...prev, [field]: value }));
  }

  async function generate() {
    if (!form.grade || !form.schoolYear || !form.standards) return;
    setGenerating(true);
    setDisplayOutput("");

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

      // Parse and save to database
      const { json } = splitOutput(accumulated);
      if (json) {
        const parsedUnits = JSON.parse(json) as Array<{
          title: string;
          weeks: number;
          standards: string;
          summary: string;
          anchorTexts: string;
          flags: string;
        }>;

        await fetch("/api/year-plan/save", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            grade: parseInt(form.grade),
            schoolYear: form.schoolYear,
            units: parsedUnits,
            rawPlan: accumulated,
          }),
        });

        // Reload courses from DB
        await fetchCourses();
        setShowForm(false);
        setDisplayOutput("");
        setForm(emptyForm);
      }
    } catch (err) {
      setDisplayOutput("Something went wrong. Please try again.");
      console.error(err);
    } finally {
      setGenerating(false);
    }
  }

  const canGenerate =
    form.grade && form.schoolYear && form.standards && !generating;

  if (loading) {
    return (
      <div className="min-h-screen bg-zinc-50 dark:bg-zinc-950 flex items-center justify-center">
        <span className="text-sm text-zinc-400 animate-pulse">
          Loading curriculum...
        </span>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-zinc-50 dark:bg-zinc-950">
      <div className="max-w-4xl mx-auto px-6 py-8 space-y-6">
        {/* ── Header ─── */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-lg font-semibold text-zinc-900 dark:text-zinc-50">
              Curriculum Compiler
              {schoolYear && (
                <span className="ml-2 text-sm font-normal text-zinc-400">
                  {schoolYear}
                </span>
              )}
            </h1>
            <p className="text-sm text-zinc-500 dark:text-zinc-400">
              Your courses and units — click a unit to see lessons
            </p>
          </div>
          {!showForm && (
            <button
              onClick={() => setShowForm(true)}
              className="text-sm font-medium text-zinc-600 dark:text-zinc-300 hover:text-zinc-900 dark:hover:text-zinc-100 transition-colors"
            >
              + Generate Year Plan
            </button>
          )}
        </div>

        {/* ── Existing courses ─── */}
        {courses.length > 0 && !showForm && (
          <div className="space-y-10">
            {courses.map((course) => {
              const quarters = ["Q1", "Q2", "Q3", "Q4"];

              return (
                <div key={course.id}>
                  <div className="flex items-center justify-between mb-5">
                    <h2 className="text-sm font-semibold text-zinc-900 dark:text-zinc-50">
                      Grade {course.grade} — {course.title}
                    </h2>
                    <Link
                      href={`/curriculum/edit/${course.id}`}
                      className="inline-flex items-center gap-1.5 text-xs font-medium text-zinc-500 hover:text-zinc-800 dark:text-zinc-400 dark:hover:text-zinc-200 bg-zinc-100 dark:bg-zinc-800 hover:bg-zinc-200 dark:hover:bg-zinc-700 rounded-lg px-3 py-1.5 transition-colors"
                    >
                      <svg width="12" height="12" viewBox="0 0 16 16" fill="currentColor" className="opacity-60">
                        <path d="M12.146.854a.5.5 0 01.708 0l2.292 2.292a.5.5 0 010 .708L5.854 13.146a.5.5 0 01-.233.131l-4 1a.5.5 0 01-.606-.606l1-4a.5.5 0 01.131-.232L12.146.854z" />
                      </svg>
                      Edit Curriculum
                    </Link>
                  </div>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    {quarters.map((q) => {
                      const quarterUnits = course.units.filter(
                        (u) => u.quarter === q
                      );
                      const qs = QUARTER_STYLES[q];

                      return (
                        <div
                          key={q}
                          className={`rounded-xl border border-l-4 border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 p-4 ${qs?.border ?? ""}`}
                        >
                          <div className="flex items-center gap-2 mb-3">
                            <span className={`text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full ${qs?.badge ?? "bg-zinc-100 text-zinc-500"}`}>
                              {q}
                            </span>
                            <span className="text-xs text-zinc-400">
                              {quarterUnits.length} {quarterUnits.length === 1 ? "unit" : "units"}
                            </span>
                          </div>
                          {quarterUnits.length > 0 ? (
                            <div className="space-y-2">
                              {quarterUnits.map((unit) => (
                                <Link
                                  key={unit.id}
                                  href={`/curriculum/${unit.id}`}
                                  className={`block rounded-lg border border-zinc-100 dark:border-zinc-800 px-4 py-3 transition-colors ${qs?.accent ?? "hover:border-zinc-300"}`}
                                >
                                  <div className="flex items-center gap-2 text-xs text-zinc-400 mb-1">
                                    <span>{unit.durationWeeks} weeks</span>
                                    {unit.source === "human" && (
                                      <span className="text-[10px] font-medium text-emerald-600 dark:text-emerald-400 bg-emerald-50 dark:bg-emerald-950/30 rounded-full px-2 py-0.5">
                                        from docs
                                      </span>
                                    )}
                                  </div>
                                  <div className="text-sm font-medium text-zinc-900 dark:text-zinc-50">
                                    {unit.title}
                                  </div>
                                  <div className="text-xs text-zinc-500 dark:text-zinc-400 mt-1 line-clamp-2 leading-relaxed">
                                    {unit.summary}
                                  </div>
                                </Link>
                              ))}
                            </div>
                          ) : (
                            <p className="text-xs text-zinc-400 italic">
                              No units planned
                            </p>
                          )}
                        </div>
                      );
                    })}
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {/* ── Empty state ─── */}
        {courses.length === 0 && !showForm && (
          <div className="text-center py-16">
            <p className="text-zinc-500 dark:text-zinc-400 mb-4">
              No curriculum yet. Generate a year plan to get started.
            </p>
            <button
              onClick={() => setShowForm(true)}
              className="rounded-lg bg-zinc-900 dark:bg-zinc-100 px-5 py-2.5 text-sm font-medium text-white dark:text-zinc-900 hover:bg-zinc-800 dark:hover:bg-zinc-200 transition-colors"
            >
              Generate Year Plan
            </button>
          </div>
        )}

        {/* ── Generation form ─── */}
        {showForm && (
          <div className="bg-white dark:bg-zinc-900 rounded-xl border border-zinc-200 dark:border-zinc-800 p-6 space-y-5">
            <div className="flex items-center justify-between">
              <h2 className="text-sm font-semibold text-zinc-700 dark:text-zinc-300">
                Generate a new year plan
              </h2>
              <button
                onClick={() => {
                  setShowForm(false);
                  setDisplayOutput("");
                }}
                className="text-xs text-zinc-400 hover:text-zinc-700 dark:hover:text-zinc-300 transition-colors"
              >
                Cancel
              </button>
            </div>

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
              <textarea
                rows={3}
                value={form.notes}
                onChange={(e) => update("notes", e.target.value)}
                placeholder="e.g. Poetry unit ran 2 weeks over. Students struggled with argumentative writing."
                className="w-full resize-none rounded-lg border border-zinc-300 dark:border-zinc-700 bg-zinc-50 dark:bg-zinc-800 px-3 py-2 text-sm text-zinc-900 dark:text-zinc-100 placeholder-zinc-400 focus:outline-none focus:ring-2 focus:ring-zinc-900 dark:focus:ring-zinc-100"
              />
            </div>

            <button
              onClick={generate}
              disabled={!canGenerate}
              className="w-full h-11 rounded-xl bg-zinc-900 dark:bg-zinc-100 text-white dark:text-zinc-900 text-sm font-medium disabled:opacity-40 hover:bg-zinc-700 dark:hover:bg-zinc-300 transition-colors"
            >
              {generating ? "Generating..." : "Generate Year Plan"}
            </button>
          </div>
        )}

        {/* ── Streaming output ─── */}
        {generating && displayOutput && (
          <div className="bg-white dark:bg-zinc-900 rounded-xl border border-zinc-200 dark:border-zinc-800 p-6">
            <div className="prose prose-zinc dark:prose-invert max-w-none text-sm leading-relaxed">
              <ReactMarkdown>{displayOutput}</ReactMarkdown>
              <span className="inline-block w-1.5 h-4 ml-0.5 bg-zinc-400 animate-pulse align-middle" />
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
