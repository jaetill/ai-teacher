"use client";

import { useState, useEffect, useCallback } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import ReactMarkdown from "react-markdown";

function LessonCard({ lesson }: { lesson: Lesson }) {
  const [expanded, setExpanded] = useState(false);
  const [notes, setNotes] = useState(lesson.teacherNotes ?? "");
  const [saving, setSaving] = useState(false);
  const activities = (lesson.lessonPlan as { activities?: string[] })
    ?.activities;

  async function saveNotes() {
    setSaving(true);
    try {
      await fetch(`/api/lessons/${lesson.id}/notes`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ notes }),
      });
    } finally {
      setSaving(false);
    }
  }

  return (
    <div
      className="rounded-lg border border-zinc-100 dark:border-zinc-800 px-4 py-3 cursor-pointer hover:border-zinc-300 dark:hover:border-zinc-600 transition-colors"
      onClick={() => setExpanded(!expanded)}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="text-xs text-zinc-400 mb-0.5">
            Day {lesson.sortOrder}
            {lesson.durationMinutes && ` · ${lesson.durationMinutes} min`}
          </div>
          <div className="text-sm font-medium text-zinc-900 dark:text-zinc-50">
            {lesson.title}
          </div>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          {lesson.teacherNotes && !expanded && (
            <span className="w-1.5 h-1.5 rounded-full bg-amber-400" title="Has notes" />
          )}
          {lesson.source === "human" && (
            <span className="text-xs text-emerald-500">from docs</span>
          )}
          <span
            className={`text-zinc-400 text-xs transition-transform ${expanded ? "rotate-90" : ""}`}
          >
            →
          </span>
        </div>
      </div>
      {expanded && (
        <div className="mt-3 pt-3 border-t border-zinc-100 dark:border-zinc-800 space-y-3">
          {lesson.objectives && lesson.objectives.length > 0 && (
            <div>
              <div className="text-xs font-medium text-zinc-500 dark:text-zinc-400 mb-1">
                Objectives
              </div>
              <ul className="space-y-1">
                {lesson.objectives.map((obj, i) => (
                  <li
                    key={i}
                    className="text-xs text-zinc-600 dark:text-zinc-400 pl-3 relative before:content-['·'] before:absolute before:left-0 before:text-zinc-400"
                  >
                    {obj}
                  </li>
                ))}
              </ul>
            </div>
          )}
          {activities && activities.length > 0 && (
            <div>
              <div className="text-xs font-medium text-zinc-500 dark:text-zinc-400 mb-1">
                Activities
              </div>
              <ul className="space-y-1">
                {activities.map((act, i) => (
                  <li
                    key={i}
                    className="text-xs text-zinc-600 dark:text-zinc-400 pl-3 relative before:content-['·'] before:absolute before:left-0 before:text-zinc-400"
                  >
                    {act}
                  </li>
                ))}
              </ul>
            </div>
          )}
          <div onClick={(e) => e.stopPropagation()}>
            <div className="text-xs font-medium text-zinc-500 dark:text-zinc-400 mb-1">
              Notes
            </div>
            <textarea
              rows={2}
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              onBlur={saveNotes}
              placeholder="Pacing thoughts, what to adjust, student reactions..."
              className="w-full resize-none rounded-md border border-zinc-200 dark:border-zinc-700 bg-zinc-50 dark:bg-zinc-800 px-2.5 py-1.5 text-xs text-zinc-700 dark:text-zinc-300 placeholder-zinc-400 focus:outline-none focus:ring-1 focus:ring-zinc-400 dark:focus:ring-zinc-500"
            />
            {saving && (
              <span className="text-xs text-zinc-400 mt-0.5">Saving...</span>
            )}
          </div>
          {lesson.standards && lesson.standards.length > 0 && (
            <div>
              <div className="text-xs font-medium text-zinc-500 dark:text-zinc-400 mb-1">
                Standards
              </div>
              <div className="flex flex-wrap gap-1.5">
                {lesson.standards.map((s) => (
                  <span
                    key={s.id}
                    className="inline-flex items-center gap-1 rounded-md bg-zinc-100 dark:bg-zinc-800 px-2 py-0.5 text-xs text-zinc-600 dark:text-zinc-400"
                    title={s.coverageType}
                  >
                    {s.id}
                    <span className="text-zinc-400 dark:text-zinc-500">
                      {s.coverageType === "introduces"
                        ? "intro"
                        : s.coverageType === "teaches"
                          ? "teach"
                          : s.coverageType === "reinforces"
                            ? "review"
                            : "assess"}
                    </span>
                  </span>
                ))}
              </div>
            </div>
          )}
          {lesson.materials && lesson.materials.length > 0 && (
            <div>
              <div className="text-xs font-medium text-zinc-500 dark:text-zinc-400 mb-1">
                Materials
              </div>
              <div className="space-y-1">
                {lesson.materials.map((m, i) => (
                  <div key={i} className="flex items-center gap-2 text-xs">
                    {m.driveWebUrl ? (
                      <a
                        href={m.driveWebUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-blue-600 dark:text-blue-400 hover:underline truncate"
                        onClick={(e) => e.stopPropagation()}
                      >
                        {m.title}
                      </a>
                    ) : (
                      <span className="text-zinc-600 dark:text-zinc-400 truncate">
                        {m.title}
                      </span>
                    )}
                    <span className="text-zinc-400 dark:text-zinc-500 shrink-0">
                      {m.role}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ── Types ───

type Standard = {
  id: string;
  description: string;
  strandCode: string;
  strandName: string;
  emphasis: string;
};

type LessonStandard = {
  id: string;
  coverageType: string;
};

type MaterialLink = {
  title: string;
  materialType: string;
  driveWebUrl: string | null;
  role: string;
};

type Lesson = {
  id: string;
  title: string;
  sortOrder: number;
  durationMinutes: number | null;
  objectives: string[] | null;
  lessonPlan: Record<string, unknown>;
  teacherNotes: string | null;
  source: string;
  standards: LessonStandard[];
  materials: MaterialLink[];
};

type UnitDetail = {
  id: string;
  title: string;
  grade: number;
  courseTitle: string;
  sortOrder: number;
  durationWeeks: number;
  summary: string;
  essentialQuestions: string | null;
  anchorTexts: string | null;
  contentWarnings: string | null;
  teacherNotes: string | null;
  aiGenerationContext: { lessonPlanMarkdown?: string } | null;
  source: string;
  lessons: Lesson[];
  standards: Standard[];
  materials: MaterialLink[];
  driveCurriculumUrl: string | null;
  driveQuarterUrl: string | null;
};

// ── Component ───

export default function UnitDetailPage() {
  const { unitId } = useParams<{ unitId: string }>();
  const [unit, setUnit] = useState<UnitDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [notes, setNotes] = useState("");
  const [savingNotes, setSavingNotes] = useState(false);
  const [generatedPlan, setGeneratedPlan] = useState("");
  const [generating, setGenerating] = useState(false);
  const [inferring, setInferring] = useState(false);
  const [linking, setLinking] = useState(false);
  const [linkError, setLinkError] = useState<string | null>(null);

  const fetchUnit = useCallback(async () => {
    try {
      const res = await fetch(`/api/units/${unitId}`);
      if (!res.ok) {
        setUnit(null);
        return;
      }
      const data = await res.json();
      setUnit(data.unit);
      setNotes(data.unit.teacherNotes ?? "");
      if (data.unit.aiGenerationContext?.lessonPlanMarkdown) {
        setGeneratedPlan(data.unit.aiGenerationContext.lessonPlanMarkdown);
      }
    } catch (err) {
      console.error("Failed to load unit", err);
    } finally {
      setLoading(false);
    }
  }, [unitId]);

  useEffect(() => {
    fetchUnit();
  }, [fetchUnit]);

  async function saveNotes() {
    if (!unit) return;
    setSavingNotes(true);
    try {
      await fetch(`/api/units/${unit.id}/notes`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ notes }),
      });
    } finally {
      setSavingNotes(false);
    }
  }

  async function generateLessonPlan() {
    if (!unit) return;
    setGenerating(true);
    setGeneratedPlan("");

    let accumulated = "";

    try {
      const res = await fetch("/api/curriculum", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          grade: unit.grade,
          theme: unit.title,
          weeks: unit.durationWeeks,
          standards: unit.standards.map((s) => s.id).join(", "),
          context:
            unit.summary + (notes ? `\n\nTeacher notes: ${notes}` : ""),
        }),
      });

      if (!res.ok || !res.body) throw new Error(`API error ${res.status}`);

      const reader = res.body.getReader();
      const decoder = new TextDecoder();

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        accumulated += decoder.decode(value, { stream: true });
        setGeneratedPlan(accumulated);
      }

      // Save to DB
      await fetch("/api/curriculum/save", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ unitId: unit.id, lessonPlan: accumulated }),
      });
    } catch (err) {
      setGeneratedPlan("Something went wrong. Please try again.");
      console.error(err);
    } finally {
      setGenerating(false);
    }
  }

  async function inferStandards() {
    if (!unit) return;
    setInferring(true);
    try {
      const res = await fetch(`/api/units/${unit.id}/infer-standards`, {
        method: "POST",
      });
      if (res.ok) {
        await fetchUnit();
      }
    } finally {
      setInferring(false);
    }
  }

  async function linkMaterials() {
    if (!unit) return;
    setLinking(true);
    setLinkError(null);
    try {
      const res = await fetch(`/api/units/${unit.id}/link-materials`, {
        method: "POST",
      });
      const data = await res.json();
      if (res.ok) {
        await fetchUnit();
      } else {
        setLinkError(data.error || "Failed to link materials");
      }
    } finally {
      setLinking(false);
    }
  }

  const hasLessonMaterials = unit?.lessons.some(
    (l) => l.materials && l.materials.length > 0
  );

  const hasLessonStandards = unit?.lessons.some(
    (l) => l.standards && l.standards.length > 0
  );

  if (loading) {
    return (
      <div className="min-h-screen bg-zinc-50 dark:bg-zinc-950 flex items-center justify-center">
        <span className="text-sm text-zinc-400 animate-pulse">
          Loading unit...
        </span>
      </div>
    );
  }

  if (!unit) {
    return (
      <div className="min-h-screen bg-zinc-50 dark:bg-zinc-950 flex items-center justify-center">
        <p className="text-sm text-zinc-400">Unit not found.</p>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-zinc-50 dark:bg-zinc-950">
      <div className="max-w-4xl mx-auto px-6 py-8 space-y-6">
        {/* ── Breadcrumb ─── */}
        <nav className="flex items-center gap-1.5 text-xs text-zinc-400">
          <Link
            href="/curriculum"
            className="hover:text-zinc-700 dark:hover:text-zinc-300 transition-colors"
          >
            Curriculum
          </Link>
          <span>/</span>
          <Link
            href="/curriculum"
            className="hover:text-zinc-700 dark:hover:text-zinc-300 transition-colors"
          >
            Grade {unit.grade}
          </Link>
          <span>/</span>
          <Link
            href="/curriculum"
            className="hover:text-zinc-700 dark:hover:text-zinc-300 transition-colors"
          >
            Q{Math.ceil(unit.sortOrder / 2)}
          </Link>
          <span>/</span>
          <span className="text-zinc-600 dark:text-zinc-300 truncate">
            {unit.title}
          </span>
        </nav>

        {/* ── Unit summary ─── */}
        <div className="bg-white dark:bg-zinc-900 rounded-xl border border-zinc-200 dark:border-zinc-800 p-6 space-y-4">
          <div>
            <div className="text-xs text-zinc-400 mb-1">
              {unit.durationWeeks} weeks ·{" "}
              {unit.source === "human" ? "from curriculum docs" : "AI generated"}
            </div>
            <h1 className="text-xl font-semibold text-zinc-900 dark:text-zinc-50">
              {unit.title}
            </h1>
          </div>
          <div>
            <h2 className="text-sm font-medium text-zinc-700 dark:text-zinc-300 mb-1">
              Summary
            </h2>
            <p className="text-sm text-zinc-600 dark:text-zinc-400 leading-relaxed">
              {unit.summary}
            </p>
          </div>
          {unit.essentialQuestions && (
            <div>
              <span className="text-sm font-medium text-zinc-700 dark:text-zinc-300">
                Essential questions:
              </span>
              <p className="text-sm text-zinc-500 dark:text-zinc-400 mt-1">
                {unit.essentialQuestions}
              </p>
            </div>
          )}
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
          {unit.contentWarnings && (
            <div className="rounded-lg bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-800 px-4 py-3 text-sm text-amber-700 dark:text-amber-400">
              Warning: {unit.contentWarnings}
            </div>
          )}
          {unit.driveCurriculumUrl && (
            <a
              href={unit.driveCurriculumUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1.5 text-sm text-zinc-500 hover:text-zinc-700 dark:hover:text-zinc-300 transition-colors"
            >
              Curriculum files in Drive →
            </a>
          )}
        </div>

        {/* ── Standards ─── */}
        {unit.standards.length > 0 && (
          <div className="bg-white dark:bg-zinc-900 rounded-xl border border-zinc-200 dark:border-zinc-800 p-6 space-y-3">
            <h2 className="text-sm font-semibold text-zinc-700 dark:text-zinc-300">
              Standards ({unit.standards.length})
            </h2>
            <div className="space-y-2">
              {unit.standards.map((s) => (
                <div key={s.id} className="flex gap-3 text-sm">
                  <span className="font-mono text-xs text-zinc-500 dark:text-zinc-400 shrink-0 pt-0.5">
                    {s.id}
                  </span>
                  <span className="text-zinc-600 dark:text-zinc-400">
                    {s.description}
                  </span>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* ── Teacher notes ─── */}
        <div className="bg-white dark:bg-zinc-900 rounded-xl border border-zinc-200 dark:border-zinc-800 p-6 space-y-3">
          <div>
            <h2 className="text-sm font-semibold text-zinc-700 dark:text-zinc-300">
              Teacher Notes
            </h2>
            <p className="text-xs text-zinc-400 mt-0.5">
              Saved and fed back into future planning
            </p>
          </div>
          <textarea
            rows={3}
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            onBlur={saveNotes}
            placeholder="e.g. Students struggled with the ambiguous ending. Consider a trigger warning next year."
            className="w-full resize-none rounded-lg border border-zinc-300 dark:border-zinc-700 bg-zinc-50 dark:bg-zinc-800 px-3 py-2 text-sm text-zinc-900 dark:text-zinc-100 placeholder-zinc-400 focus:outline-none focus:ring-2 focus:ring-zinc-900 dark:focus:ring-zinc-100"
          />
          <button
            onClick={saveNotes}
            disabled={savingNotes}
            className="text-xs text-zinc-400 hover:text-zinc-700 dark:hover:text-zinc-300 transition-colors"
          >
            {savingNotes ? "Saving..." : "Save notes"}
          </button>
        </div>

        {/* ── Lessons from DB ─── */}
        {unit.lessons.length > 0 && (
          <div className="bg-white dark:bg-zinc-900 rounded-xl border border-zinc-200 dark:border-zinc-800 p-6 space-y-4">
            <div className="flex items-center justify-between">
              <h2 className="text-sm font-semibold text-zinc-700 dark:text-zinc-300">
                Lessons ({unit.lessons.length})
              </h2>
              <div className="flex items-center gap-3">
                {!hasLessonMaterials && (
                  <button
                    onClick={linkMaterials}
                    disabled={linking}
                    className="text-xs text-zinc-400 hover:text-zinc-700 dark:hover:text-zinc-300 transition-colors disabled:opacity-40"
                  >
                    {linking
                      ? "Linking materials..."
                      : "Link materials to lessons"}
                  </button>
                )}
                {!hasLessonStandards && unit.standards.length > 0 && (
                  <button
                    onClick={inferStandards}
                    disabled={inferring}
                    className="text-xs text-zinc-400 hover:text-zinc-700 dark:hover:text-zinc-300 transition-colors disabled:opacity-40"
                  >
                    {inferring
                      ? "Mapping standards..."
                      : "Map standards to lessons"}
                  </button>
                )}
              </div>
            </div>
            <div className="space-y-3">
              {unit.lessons.map((lesson) => (
                <LessonCard key={lesson.id} lesson={lesson} />
              ))}
            </div>
          </div>
        )}

        {linkError && (
          <div className="rounded-lg border border-amber-200 dark:border-amber-800 bg-amber-50 dark:bg-amber-950/50 px-4 py-3 text-sm text-amber-700 dark:text-amber-300">
            {linkError}
          </div>
        )}

        {/* ── Unit-level materials ─── */}
        {unit.materials && unit.materials.length > 0 && (
          <div className="bg-white dark:bg-zinc-900 rounded-xl border border-zinc-200 dark:border-zinc-800 p-6 space-y-3">
            <h2 className="text-sm font-semibold text-zinc-700 dark:text-zinc-300">
              Unit Materials
            </h2>
            <div className="space-y-1.5">
              {unit.materials.map((m, i) => (
                <div key={i} className="flex items-center gap-2 text-sm">
                  {m.driveWebUrl ? (
                    <a
                      href={m.driveWebUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-blue-600 dark:text-blue-400 hover:underline truncate"
                    >
                      {m.title}
                    </a>
                  ) : (
                    <span className="text-zinc-600 dark:text-zinc-400 truncate">
                      {m.title}
                    </span>
                  )}
                  <span className="text-xs text-zinc-400 dark:text-zinc-500 shrink-0">
                    {m.role}
                  </span>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* ── AI lesson sequence ─── */}
        <div className="bg-white dark:bg-zinc-900 rounded-xl border border-zinc-200 dark:border-zinc-800 p-6 space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-sm font-semibold text-zinc-700 dark:text-zinc-300">
                AI Lesson Sequence
              </h2>
              <p className="text-xs text-zinc-400 mt-0.5">
                Generate a detailed week-by-week breakdown
              </p>
            </div>
            {generatedPlan && !generating && (
              <button
                onClick={generateLessonPlan}
                className="text-xs text-zinc-400 hover:text-zinc-700 dark:hover:text-zinc-300 transition-colors"
              >
                Regenerate
              </button>
            )}
          </div>

          {!generatedPlan && !generating && (
            <button
              onClick={generateLessonPlan}
              className="w-full h-11 rounded-xl bg-zinc-900 dark:bg-zinc-100 text-white dark:text-zinc-900 text-sm font-medium hover:bg-zinc-700 dark:hover:bg-zinc-300 transition-colors"
            >
              Generate Lesson Sequence
            </button>
          )}

          {generating && !generatedPlan && (
            <div className="flex items-center gap-2 text-sm text-zinc-400">
              <span className="inline-block w-1.5 h-4 bg-zinc-400 animate-pulse" />
              Building lesson sequence...
            </div>
          )}

          {generatedPlan && (
            <div className="prose prose-zinc dark:prose-invert max-w-none text-sm leading-relaxed">
              <ReactMarkdown>{generatedPlan}</ReactMarkdown>
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
