"use client";

// /templates — where the teacher defines the shape of her own lessons (#647).
//
// The first thing this page offers is not a blank form but "read my lessons
// and tell me what I already do". She edits the proposal instead of inventing
// a structure from memory. Everything else here — naming fields, marking the
// ones that matter, saying what belongs in each — is editing that starting
// point.

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  normalizeFields,
  slugify,
  FIELD_TYPES,
  MAX_FIELDS,
  type FieldType,
  type TemplateField,
} from "@/lib/lesson-template";

type Template = {
  id: string | null;
  name: string;
  description: string | null;
  fields: TemplateField[];
  isDefault: boolean;
  source: string;
  builtin: boolean;
};

type ReportGap = { label: string; count: number };
type Report = {
  total: number;
  complete: number;
  incomplete: number;
  commonGaps: ReportGap[];
  lessons: Array<{
    lessonId: string;
    title: string;
    unitTitle: string;
    grade: number;
    templateName: string;
    missingRequired: string[];
  }>;
};

const blankField = (): TemplateField => ({
  key: "",
  label: "",
  type: "text",
  required: false,
  aiHint: null,
});

export default function TemplatesPage() {
  const [templates, setTemplates] = useState<Template[]>([]);
  const [builtin, setBuiltin] = useState<Template | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  // Editor state — null when nothing is open.
  const [editingId, setEditingId] = useState<string | null | undefined>(undefined);
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [fields, setFields] = useState<TemplateField[]>([]);
  const [isDefault, setIsDefault] = useState(false);
  const [saving, setSaving] = useState(false);
  const [deriving, setDeriving] = useState(false);

  const [report, setReport] = useState<Report | null>(null);
  const [reportLoading, setReportLoading] = useState(false);

  const editorOpen = editingId !== undefined;

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/lesson-templates");
      if (!res.ok) throw new Error("Could not load your templates");
      const data = await res.json();
      setTemplates(data.templates ?? []);
      setBuiltin(data.builtin ?? null);
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not load your templates");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  function openEditor(t: Template | null) {
    setEditingId(t?.id ?? null);
    setName(t ? (t.builtin ? `${t.name} (copy)` : t.name) : "");
    setDescription(t?.description ?? "");
    setFields(t ? t.fields.map((f) => ({ ...f })) : []);
    setIsDefault(t?.isDefault ?? false);
    setNotice(null);
    setError(null);
  }

  function closeEditor() {
    setEditingId(undefined);
    setNotice(null);
  }

  // Live validation so Save can't produce a surprise 400 — same rules the API
  // enforces, imported rather than re-implemented.
  const validation = useMemo(() => normalizeFields(fields), [fields]);
  const canSave = name.trim().length > 0 && validation.ok && !saving;

  function updateField(i: number, patch: Partial<TemplateField>) {
    setFields((prev) => prev.map((f, idx) => (idx === i ? { ...f, ...patch } : f)));
  }

  function moveField(i: number, delta: number) {
    setFields((prev) => {
      const next = [...prev];
      const j = i + delta;
      if (j < 0 || j >= next.length) return prev;
      [next[i], next[j]] = [next[j], next[i]];
      return next;
    });
  }

  async function derive() {
    setDeriving(true);
    setError(null);
    setNotice(null);
    try {
      const res = await fetch("/api/lesson-templates/derive", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({}),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Could not read your lessons");
      setFields((data.fields as TemplateField[]).map((f) => ({ ...f })));
      if (!name.trim()) setName(data.derived ? "My lesson format" : "Starter format");
      setNotice(
        data.derived
          ? `Read ${data.sampled} of your lessons. ${data.notes ?? ""} Edit anything that doesn't match how you actually teach.`
          : (data.notes ?? "Here's a starting point — edit it freely."),
      );
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not read your lessons");
    } finally {
      setDeriving(false);
    }
  }

  async function save() {
    if (!validation.ok) return;
    setSaving(true);
    setError(null);
    try {
      const editingExisting = typeof editingId === "string";
      const res = await fetch("/api/lesson-templates", {
        method: editingExisting ? "PATCH" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...(editingExisting ? { id: editingId } : {}),
          name: name.trim(),
          description: description.trim() || null,
          fields: validation.fields,
          isDefault,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Could not save");
      closeEditor();
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not save");
    } finally {
      setSaving(false);
    }
  }

  async function remove(id: string, templateName: string) {
    if (!confirm(`Delete "${templateName}"? Your lessons keep their content.`)) return;
    setError(null);
    try {
      const res = await fetch(`/api/lesson-templates?id=${id}`, { method: "DELETE" });
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error ?? "Could not delete");
      }
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not delete");
    }
  }

  async function runReport() {
    setReportLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/lesson-templates/report");
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Could not check your lessons");
      setReport(data);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not check your lessons");
    } finally {
      setReportLoading(false);
    }
  }

  return (
    <div className="max-w-4xl mx-auto px-6 py-8">
      <header className="mb-6">
        <h1 className="text-2xl font-semibold text-zinc-900 dark:text-zinc-100">
          Lesson templates
        </h1>
        <p className="mt-1 text-sm text-zinc-600 dark:text-zinc-400">
          A template is your definition of what a lesson contains. Once it&apos;s set, new
          lessons are generated in your structure, and you can check which existing lessons
          don&apos;t match it.
        </p>
      </header>

      {error && (
        <div className="mb-4 rounded-md border border-red-300 bg-red-50 px-3 py-2 text-sm text-red-800 dark:border-red-900 dark:bg-red-950 dark:text-red-200">
          {error}
        </div>
      )}

      {!editorOpen && (
        <>
          <div className="mb-6 flex flex-wrap gap-2">
            <button
              onClick={() => openEditor(null)}
              className="rounded-md bg-blue-600 px-3 py-2 text-sm font-medium text-white hover:bg-blue-700"
            >
              New template
            </button>
            <button
              onClick={runReport}
              disabled={reportLoading}
              className="rounded-md border border-zinc-300 px-3 py-2 text-sm font-medium text-zinc-700 hover:bg-zinc-50 disabled:opacity-50 dark:border-zinc-700 dark:text-zinc-200 dark:hover:bg-zinc-900"
            >
              {reportLoading ? "Checking…" : "Check my lessons"}
            </button>
          </div>

          {loading ? (
            <p className="text-sm text-zinc-500">Loading…</p>
          ) : (
            <ul className="space-y-3">
              {templates.map((t) => (
                <li
                  key={t.id ?? t.name}
                  className="rounded-lg border border-zinc-200 p-4 dark:border-zinc-800"
                >
                  <div className="flex items-start justify-between gap-4">
                    <div className="min-w-0">
                      <div className="flex items-center gap-2">
                        <h2 className="font-medium text-zinc-900 dark:text-zinc-100">
                          {t.name}
                        </h2>
                        {t.isDefault && (
                          <span className="rounded bg-blue-100 px-1.5 py-0.5 text-xs text-blue-800 dark:bg-blue-950 dark:text-blue-200">
                            default
                          </span>
                        )}
                        {t.source === "derived" && (
                          <span className="rounded bg-zinc-100 px-1.5 py-0.5 text-xs text-zinc-600 dark:bg-zinc-800 dark:text-zinc-300">
                            from your lessons
                          </span>
                        )}
                      </div>
                      {t.description && (
                        <p className="mt-1 text-sm text-zinc-600 dark:text-zinc-400">
                          {t.description}
                        </p>
                      )}
                      <p className="mt-2 text-sm text-zinc-500">
                        {t.fields.map((f) => f.label).join(" · ")}
                      </p>
                    </div>
                    <div className="flex shrink-0 gap-2">
                      <button
                        onClick={() => openEditor(t)}
                        className="text-sm text-blue-600 hover:underline dark:text-blue-400"
                      >
                        Edit
                      </button>
                      {t.id && (
                        <button
                          onClick={() => remove(t.id!, t.name)}
                          className="text-sm text-red-600 hover:underline dark:text-red-400"
                        >
                          Delete
                        </button>
                      )}
                    </div>
                  </div>
                </li>
              ))}

              {builtin && (
                <li className="rounded-lg border border-dashed border-zinc-300 p-4 dark:border-zinc-700">
                  <div className="flex items-start justify-between gap-4">
                    <div>
                      <h2 className="font-medium text-zinc-700 dark:text-zinc-300">
                        {builtin.name}{" "}
                        <span className="text-xs font-normal text-zinc-500">
                          built in — used when nothing else is set
                        </span>
                      </h2>
                      <p className="mt-1 text-sm text-zinc-500">{builtin.description}</p>
                    </div>
                    <button
                      onClick={() => openEditor(builtin)}
                      className="shrink-0 text-sm text-blue-600 hover:underline dark:text-blue-400"
                    >
                      Copy &amp; edit
                    </button>
                  </div>
                </li>
              )}
            </ul>
          )}

          {report && (
            <section className="mt-8 rounded-lg border border-zinc-200 p-4 dark:border-zinc-800">
              <h2 className="font-medium text-zinc-900 dark:text-zinc-100">
                {report.complete} of {report.total} lessons match their template
              </h2>
              {report.incomplete === 0 ? (
                <p className="mt-1 text-sm text-zinc-600 dark:text-zinc-400">
                  Everything lines up with how you said you teach.
                </p>
              ) : (
                <>
                  {report.commonGaps.length > 0 && (
                    <p className="mt-1 text-sm text-zinc-600 dark:text-zinc-400">
                      Most often missing:{" "}
                      {report.commonGaps
                        .map((g) => `${g.label} (${g.count})`)
                        .join(", ")}
                      .
                    </p>
                  )}
                  <ul className="mt-3 space-y-1 text-sm">
                    {report.lessons
                      .filter((l) => l.missingRequired.length > 0)
                      .slice(0, 40)
                      .map((l) => (
                        <li key={l.lessonId} className="text-zinc-700 dark:text-zinc-300">
                          <span className="text-zinc-500">
                            Grade {l.grade} · {l.unitTitle} ·{" "}
                          </span>
                          {l.title}
                          <span className="text-amber-700 dark:text-amber-400">
                            {" "}
                            — missing {l.missingRequired.join(", ")}
                          </span>
                        </li>
                      ))}
                  </ul>
                  {report.incomplete > 40 && (
                    <p className="mt-2 text-xs text-zinc-500">
                      Showing 40 of {report.incomplete}.
                    </p>
                  )}
                </>
              )}
            </section>
          )}
        </>
      )}

      {editorOpen && (
        <section className="rounded-lg border border-zinc-200 p-4 dark:border-zinc-800">
          <div className="mb-4 flex items-center justify-between">
            <h2 className="font-medium text-zinc-900 dark:text-zinc-100">
              {typeof editingId === "string" ? "Edit template" : "New template"}
            </h2>
            {/* Every page that enters edit mode needs a way out of it. */}
            <button
              onClick={closeEditor}
              className="text-sm text-zinc-600 hover:underline dark:text-zinc-400"
            >
              Done editing
            </button>
          </div>

          {notice && (
            <p className="mb-4 rounded-md border border-blue-200 bg-blue-50 px-3 py-2 text-sm text-blue-900 dark:border-blue-900 dark:bg-blue-950 dark:text-blue-200">
              {notice}
            </p>
          )}

          <div className="space-y-3">
            <div>
              <label className="block text-sm font-medium text-zinc-700 dark:text-zinc-300">
                Name
              </label>
              <input
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Reading Day"
                className="mt-1 w-full rounded-md border border-zinc-300 px-3 py-2 text-sm dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-100"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-zinc-700 dark:text-zinc-300">
                Description <span className="font-normal text-zinc-500">(optional)</span>
              </label>
              <input
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="How I structure a normal reading day"
                className="mt-1 w-full rounded-md border border-zinc-300 px-3 py-2 text-sm dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-100"
              />
            </div>
            <label className="flex items-center gap-2 text-sm text-zinc-700 dark:text-zinc-300">
              <input
                type="checkbox"
                checked={isDefault}
                onChange={(e) => setIsDefault(e.target.checked)}
              />
              Use this as my default template
            </label>
          </div>

          <div className="mt-6 mb-2 flex items-center justify-between">
            <h3 className="text-sm font-medium text-zinc-700 dark:text-zinc-300">
              Sections ({fields.length}/{MAX_FIELDS})
            </h3>
            <button
              onClick={derive}
              disabled={deriving}
              className="rounded-md border border-zinc-300 px-2 py-1 text-xs font-medium text-zinc-700 hover:bg-zinc-50 disabled:opacity-50 dark:border-zinc-700 dark:text-zinc-200 dark:hover:bg-zinc-900"
            >
              {deriving ? "Reading your lessons…" : "Suggest from my lessons"}
            </button>
          </div>

          {fields.length === 0 && (
            <p className="mb-3 rounded-md border border-dashed border-zinc-300 px-3 py-4 text-center text-sm text-zinc-500 dark:border-zinc-700">
              No sections yet. Try &ldquo;Suggest from my lessons&rdquo; — it reads what
              you&apos;ve already written and proposes the structure you use.
            </p>
          )}

          <ul className="space-y-2">
            {fields.map((f, i) => (
              <li
                key={i}
                className="rounded-md border border-zinc-200 p-3 dark:border-zinc-800"
              >
                <div className="flex flex-wrap items-center gap-2">
                  <input
                    value={f.label}
                    onChange={(e) =>
                      updateField(i, {
                        label: e.target.value,
                        // Keep the key pinned once content exists under it;
                        // only unsaved fields re-slug as you type.
                        key: f.key && typeof editingId === "string" ? f.key : slugify(e.target.value),
                      })
                    }
                    placeholder="Section name"
                    className="min-w-[10rem] flex-1 rounded-md border border-zinc-300 px-2 py-1 text-sm dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-100"
                  />
                  <select
                    value={f.type}
                    onChange={(e) => updateField(i, { type: e.target.value as FieldType })}
                    className="rounded-md border border-zinc-300 px-2 py-1 text-sm dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-100"
                  >
                    {FIELD_TYPES.map((t) => (
                      <option key={t} value={t}>
                        {t === "list" ? "List of items" : "Paragraph"}
                      </option>
                    ))}
                  </select>
                  <label className="flex items-center gap-1 text-xs text-zinc-600 dark:text-zinc-400">
                    <input
                      type="checkbox"
                      checked={f.required}
                      onChange={(e) => updateField(i, { required: e.target.checked })}
                    />
                    required
                  </label>
                  <div className="flex gap-1">
                    <button
                      onClick={() => moveField(i, -1)}
                      disabled={i === 0}
                      aria-label="Move up"
                      className="rounded px-1.5 py-0.5 text-xs text-zinc-600 hover:bg-zinc-100 disabled:opacity-30 dark:text-zinc-400 dark:hover:bg-zinc-800"
                    >
                      ↑
                    </button>
                    <button
                      onClick={() => moveField(i, 1)}
                      disabled={i === fields.length - 1}
                      aria-label="Move down"
                      className="rounded px-1.5 py-0.5 text-xs text-zinc-600 hover:bg-zinc-100 disabled:opacity-30 dark:text-zinc-400 dark:hover:bg-zinc-800"
                    >
                      ↓
                    </button>
                    <button
                      onClick={() => setFields((prev) => prev.filter((_, idx) => idx !== i))}
                      aria-label="Remove section"
                      className="rounded px-1.5 py-0.5 text-xs text-red-600 hover:bg-red-50 dark:text-red-400 dark:hover:bg-red-950"
                    >
                      ✕
                    </button>
                  </div>
                </div>
                <input
                  value={f.aiHint ?? ""}
                  onChange={(e) => updateField(i, { aiHint: e.target.value || null })}
                  placeholder="What belongs here — the AI reads this when writing a lesson"
                  className="mt-2 w-full rounded-md border border-zinc-200 px-2 py-1 text-xs text-zinc-700 dark:border-zinc-800 dark:bg-zinc-900 dark:text-zinc-300"
                />
              </li>
            ))}
          </ul>

          {fields.length < MAX_FIELDS && (
            <button
              onClick={() => setFields((prev) => [...prev, blankField()])}
              className="mt-3 text-sm text-blue-600 hover:underline dark:text-blue-400"
            >
              + Add section
            </button>
          )}

          {!validation.ok && fields.length > 0 && (
            <p className="mt-3 text-sm text-amber-700 dark:text-amber-400">
              {validation.error}
            </p>
          )}

          <div className="mt-6 flex gap-2">
            <button
              onClick={save}
              disabled={!canSave}
              className="rounded-md bg-blue-600 px-3 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50"
            >
              {saving ? "Saving…" : "Save template"}
            </button>
            <button
              onClick={closeEditor}
              className="rounded-md border border-zinc-300 px-3 py-2 text-sm font-medium text-zinc-700 hover:bg-zinc-50 dark:border-zinc-700 dark:text-zinc-200 dark:hover:bg-zinc-900"
            >
              Cancel
            </button>
          </div>
        </section>
      )}
    </div>
  );
}
