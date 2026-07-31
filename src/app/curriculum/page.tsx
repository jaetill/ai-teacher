"use client";

import { useState, useEffect, useCallback } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
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
  schoolYearId: string | null;
  units: UnitSummary[];
};

type SchoolYearOption = {
  id: string;
  name: string;
  isCurrent: boolean;
};

type CloneSource = {
  courseId: string;
  grade: number;
  title: string;
  schoolYear: string | null;
  unitCount: number;
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
  const router = useRouter();
  const [courses, setCourses] = useState<Course[]>([]);
  const [schoolYear, setSchoolYear] = useState<string | null>(null);
  const [years, setYears] = useState<SchoolYearOption[]>([]);
  const [selectedYearId, setSelectedYearId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState<FormState>(emptyForm);
  const [displayOutput, setDisplayOutput] = useState("");
  const [generating, setGenerating] = useState(false);
  const [genError, setGenError] = useState<string | null>(null);

  // ── Import-from-previous-year state (lives inside the generate form) ───
  const [cloneSources, setCloneSources] = useState<CloneSource[]>([]);
  const [importSourceId, setImportSourceId] = useState("");
  const [importTargetYear, setImportTargetYear] = useState("");
  const [importTitle, setImportTitle] = useState("");
  const [importing, setImporting] = useState(false);
  const [importError, setImportError] = useState<string | null>(null);

  const fetchCourses = useCallback(async () => {
    try {
      const res = await fetch("/api/courses");
      const data = await res.json();
      setCourses(data.courses ?? []);
      setSchoolYear(data.schoolYear ?? null);
      const yearList: SchoolYearOption[] = data.schoolYears ?? [];
      setYears(yearList);
      // Default to the current (planning) year; else the newest year listed.
      // Preserve an existing selection across refetches.
      setSelectedYearId((prev) => {
        if (prev && yearList.some((y) => y.id === prev)) return prev;
        return yearList.find((y) => y.isCurrent)?.id ?? yearList[0]?.id ?? null;
      });
    } catch (err) {
      console.error("Failed to load courses", err);
    } finally {
      setLoading(false);
    }
  }, []);

  // Load clonable source courses to populate the import block inside the form.
  const loadCloneSources = useCallback(async () => {
    setImportError(null);
    try {
      const res = await fetch("/api/curriculum/clone-year");
      if (!res.ok) throw new Error(`API error ${res.status}`);
      const data = await res.json();
      const sources: CloneSource[] = data.sources ?? [];
      setCloneSources(sources);
      if (sources.length > 0) {
        setImportSourceId(sources[0].courseId);
        setImportTitle(sources[0].title);
      }
      setImportTargetYear(
        data.suggestedTargetYear ?? `${currentYear}-${currentYear + 1}`,
      );
    } catch (err) {
      console.error("Failed to load import sources", err);
    }
  }, []);

  function openGenerateForm() {
    setShowForm(true);
    setGenError(null);
    loadCloneSources();
  }

  // Keep the title in sync with the chosen source (until the user edits it).
  function onImportSourceChange(courseId: string) {
    setImportSourceId(courseId);
    const src = cloneSources.find((s) => s.courseId === courseId);
    if (src) setImportTitle(src.title);
  }

  async function runImport() {
    if (!importSourceId || !importTargetYear.trim() || !importTitle.trim() || importing) return;
    setImporting(true);
    setImportError(null);
    try {
      const res = await fetch("/api/curriculum/clone-year", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          sourceCourseId: importSourceId,
          targetSchoolYear: importTargetYear.trim(),
          title: importTitle.trim(),
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setImportError(data.error ?? `Import failed (error ${res.status}).`);
        return;
      }
      // Land in the editor holding the cloned baseline, ready to adjust.
      router.push(`/curriculum/edit/${data.courseId}`);
    } catch (err) {
      console.error("Import failed", err);
      setImportError("Something went wrong during import. Please try again.");
    } finally {
      setImporting(false);
    }
  }

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
    setGenError(null);

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

      // Parse and save to database. On ANY failure below, keep the streamed
      // plan on screen and the form intact — clearing them made a failed save
      // silently destroy the teacher's generated plan and typed inputs.
      const { json } = splitOutput(accumulated);
      if (!json) {
        setGenError(
          "The plan finished, but no unit data was found to save. The generated text is shown below — copy anything you want to keep, then try again."
        );
        return;
      }

      const parsedUnits = JSON.parse(json) as Array<{
        title: string;
        weeks: number;
        standards: string;
        summary: string;
        anchorTexts: string;
        flags: string;
      }>;

      const saveRes = await fetch("/api/year-plan/save", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          grade: parseInt(form.grade),
          schoolYear: form.schoolYear,
          units: parsedUnits,
          rawPlan: accumulated,
        }),
      });

      if (!saveRes.ok) {
        setGenError(
          `Saving the plan failed (error ${saveRes.status}). The generated plan is still shown below — copy anything you want to keep, then try again.`
        );
        return;
      }

      // Saved — reload courses from DB and reset the form
      await fetchCourses();
      setShowForm(false);
      setDisplayOutput("");
      setForm(emptyForm);
    } catch (err) {
      setGenError(
        "Something went wrong while generating. Any partial output is shown below."
      );
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
            <h1 className="text-lg font-semibold text-zinc-900 dark:text-zinc-50 flex items-center gap-2">
              Curriculum Compiler
              {years.length > 0 ? (
                <>
                  <select
                    value={selectedYearId ?? ""}
                    onChange={(e) => setSelectedYearId(e.target.value)}
                    className="text-sm font-normal text-zinc-500 dark:text-zinc-400 bg-transparent border border-zinc-200 dark:border-zinc-700 rounded-md px-1.5 py-0.5 cursor-pointer focus:outline-none focus:ring-1 focus:ring-zinc-400"
                    title="School year"
                  >
                    {years.map((y) => (
                      <option key={y.id} value={y.id}>
                        {y.name}
                      </option>
                    ))}
                  </select>
                  {(() => {
                    const sel = years.find((y) => y.id === selectedYearId);
                    if (!sel) return null;
                    const current = years.find((y) => y.isCurrent);
                    if (sel.isCurrent) {
                      return (
                        <span className="text-[10px] font-medium uppercase tracking-wider text-emerald-600 dark:text-emerald-400 bg-emerald-50 dark:bg-emerald-950/30 rounded-full px-2 py-0.5">
                          planning
                        </span>
                      );
                    }
                    if (current && sel.name < current.name) {
                      return (
                        <span className="text-[10px] font-medium uppercase tracking-wider text-zinc-500 dark:text-zinc-400 bg-zinc-100 dark:bg-zinc-800 rounded-full px-2 py-0.5">
                          captured
                        </span>
                      );
                    }
                    return null;
                  })()}
                </>
              ) : (
                schoolYear && (
                  <span className="text-sm font-normal text-zinc-400">{schoolYear}</span>
                )
              )}
            </h1>
            <p className="text-sm text-zinc-500 dark:text-zinc-400">
              Your courses and units — click a unit to see lessons
            </p>
          </div>
          {!showForm && (
            <button
              onClick={openGenerateForm}
              className="text-sm font-medium text-zinc-600 dark:text-zinc-300 hover:text-zinc-900 dark:hover:text-zinc-100 transition-colors"
            >
              + New Year Plan
            </button>
          )}
        </div>

        {/* ── Existing courses (scoped to the selected school year; courses
             with no year yet are always shown, flagged, so they never
             silently vanish) ─── */}
        {courses.length > 0 && !showForm && (
          <div className="space-y-10">
            {courses.filter(
              (c) =>
                years.length === 0 ||
                c.schoolYearId === selectedYearId ||
                c.schoolYearId === null
            ).length === 0 && (
              <p className="text-sm text-zinc-400 dark:text-zinc-500">
                No courses in this school year yet.
              </p>
            )}
            {courses.filter(
              (c) =>
                years.length === 0 ||
                c.schoolYearId === selectedYearId ||
                c.schoolYearId === null
            ).map((course) => {
              const quarters = ["Q1", "Q2", "Q3", "Q4"];
              const yearLabel = (id: string | null) =>
                years.find((y) => y.id === id)?.name ?? "captured";

              return (
                <div key={course.id}>
                  <div className="flex items-center justify-between mb-5">
                    <h2 className="text-sm font-semibold text-zinc-900 dark:text-zinc-50">
                      Grade {course.grade} — {course.title}
                      {years.length > 0 && course.schoolYearId === null && (
                        <span className="ml-2 text-[10px] font-medium uppercase tracking-wider text-amber-600 dark:text-amber-400 bg-amber-50 dark:bg-amber-950/30 rounded-full px-2 py-0.5 align-middle">
                          no school year assigned
                        </span>
                      )}
                    </h2>
                    <div className="flex items-center gap-2 ml-3 shrink-0">
                    {/* Fork a past year's course into the current planning year
                        (product thesis: new year = fork + swaps). Clone is
                        plain rows — deletable with the course Delete in the
                        editor; the source year is never touched. */}
                    {years.some((y) => y.isCurrent) &&
                      course.schoolYearId !== null &&
                      course.schoolYearId !== years.find((y) => y.isCurrent)?.id && (
                        <button
                          onClick={async () => {
                            const yearName = years.find((y) => y.isCurrent)?.name ?? "current year";
                            if (!confirm(`Copy Grade ${course.grade} into ${yearName} as a new, editable plan? The ${yearLabel(course.schoolYearId)} original is not changed, and the copy can be deleted from its editor.`)) return;
                            const res = await fetch(`/api/courses/${course.id}/clone`, { method: "POST" });
                            const data = await res.json().catch(() => null);
                            if (!res.ok) {
                              alert(data?.error ?? "Copy failed");
                              return;
                            }
                            router.push(`/curriculum/edit/${data.courseId}`);
                          }}
                          className="inline-flex items-center gap-1.5 text-xs font-medium text-emerald-700 dark:text-emerald-400 bg-emerald-50 dark:bg-emerald-950/40 hover:bg-emerald-100 dark:hover:bg-emerald-900/40 rounded-lg px-3 py-1.5 transition-colors"
                        >
                          Copy to {years.find((y) => y.isCurrent)?.name}
                        </button>
                      )}
                    <Link
                      href={`/curriculum/calendar/${course.id}`}
                      className="inline-flex items-center gap-1.5 text-xs font-medium text-zinc-500 hover:text-zinc-800 dark:text-zinc-400 dark:hover:text-zinc-200 bg-zinc-100 dark:bg-zinc-800 hover:bg-zinc-200 dark:hover:bg-zinc-700 rounded-lg px-3 py-1.5 transition-colors"
                    >
                      Calendar
                    </Link>
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
                          <Link
                            href={`/curriculum/quarter/${course.id}/${q}`}
                            className="group flex items-center gap-2 mb-3"
                            title={`Open ${q}`}
                          >
                            <span className={`text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full ${qs?.badge ?? "bg-zinc-100 text-zinc-500"}`}>
                              {q}
                            </span>
                            <span className="text-xs text-zinc-400 group-hover:text-zinc-600 dark:group-hover:text-zinc-300 transition-colors">
                              {quarterUnits.length} {quarterUnits.length === 1 ? "unit" : "units"}
                            </span>
                            <svg width="10" height="10" viewBox="0 0 10 10" fill="currentColor" className="text-zinc-300 dark:text-zinc-600 group-hover:text-zinc-500 dark:group-hover:text-zinc-400 transition-colors">
                              <path d="M3 1l5 4-5 4V1z" />
                            </svg>
                          </Link>
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
                New year plan
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

            {/* ── Reuse a previous year (fast path) ─── */}
            {cloneSources.length > 0 && (
              <div className="rounded-xl border border-zinc-200 dark:border-zinc-800 bg-zinc-50 dark:bg-zinc-800/40 p-4 space-y-3">
                <div>
                  <h3 className="text-sm font-semibold text-zinc-800 dark:text-zinc-200">
                    Start from a previous year
                  </h3>
                  <p className="text-xs text-zinc-500 dark:text-zinc-400 mt-0.5">
                    Copies a grade&apos;s units, lessons, assessments, and material
                    links into the new year — your baseline to adjust. The same
                    Drive files are reused, not duplicated.
                  </p>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                  <div>
                    <label className="block text-xs font-medium text-zinc-500 dark:text-zinc-400 mb-1">
                      Copy from
                    </label>
                    <select
                      value={importSourceId}
                      onChange={(e) => onImportSourceChange(e.target.value)}
                      className="w-full h-9 rounded-lg border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-800 px-2 text-sm text-zinc-900 dark:text-zinc-100 focus:outline-none focus:ring-2 focus:ring-zinc-900 dark:focus:ring-zinc-100"
                    >
                      {cloneSources.map((s) => (
                        <option key={s.courseId} value={s.courseId}>
                          {s.schoolYear ? `${s.schoolYear} · ` : ""}Grade {s.grade}
                          {" — "}
                          {s.unitCount} {s.unitCount === 1 ? "unit" : "units"}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-zinc-500 dark:text-zinc-400 mb-1">
                      New school year
                    </label>
                    <input
                      type="text"
                      value={importTargetYear}
                      onChange={(e) => setImportTargetYear(e.target.value)}
                      placeholder="2026-2027"
                      className="w-full h-9 rounded-lg border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-800 px-2 text-sm text-zinc-900 dark:text-zinc-100 placeholder-zinc-400 focus:outline-none focus:ring-2 focus:ring-zinc-900 dark:focus:ring-zinc-100"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-zinc-500 dark:text-zinc-400 mb-1">
                      Course title
                    </label>
                    <input
                      type="text"
                      value={importTitle}
                      onChange={(e) => setImportTitle(e.target.value)}
                      placeholder="e.g. Grade 8 ELA (2026-2027)"
                      className="w-full h-9 rounded-lg border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-800 px-2 text-sm text-zinc-900 dark:text-zinc-100 placeholder-zinc-400 focus:outline-none focus:ring-2 focus:ring-zinc-900 dark:focus:ring-zinc-100"
                    />
                  </div>
                </div>

                {importError && (
                  <div className="rounded-lg border border-red-200 dark:border-red-900 bg-red-50 dark:bg-red-950/40 p-2.5 text-xs text-red-700 dark:text-red-300">
                    {importError}
                  </div>
                )}

                <button
                  onClick={runImport}
                  disabled={!importSourceId || !importTargetYear.trim() || !importTitle.trim() || importing}
                  className="h-9 px-4 rounded-lg bg-zinc-900 dark:bg-zinc-100 text-white dark:text-zinc-900 text-sm font-medium disabled:opacity-40 hover:bg-zinc-700 dark:hover:bg-zinc-300 transition-colors"
                >
                  {importing ? "Importing..." : "Import & edit"}
                </button>
              </div>
            )}

            {cloneSources.length > 0 && (
              <div className="flex items-center gap-3">
                <div className="h-px flex-1 bg-zinc-200 dark:bg-zinc-800" />
                <span className="text-xs font-medium text-zinc-400">or generate with AI</span>
                <div className="h-px flex-1 bg-zinc-200 dark:bg-zinc-800" />
              </div>
            )}

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

        {/* ── Generation error ─── */}
        {genError && (
          <div className="rounded-xl border border-red-200 dark:border-red-900 bg-red-50 dark:bg-red-950/40 p-4 text-sm text-red-700 dark:text-red-300">
            {genError}
          </div>
        )}

        {/* ── Streaming output (kept on screen after errors so nothing is lost) ─── */}
        {displayOutput && (
          <div className="bg-white dark:bg-zinc-900 rounded-xl border border-zinc-200 dark:border-zinc-800 p-6">
            <div className="prose prose-zinc dark:prose-invert max-w-none text-sm leading-relaxed">
              <ReactMarkdown>{displayOutput}</ReactMarkdown>
              {generating && (
                <span className="inline-block w-1.5 h-4 ml-0.5 bg-zinc-400 animate-pulse align-middle" />
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
