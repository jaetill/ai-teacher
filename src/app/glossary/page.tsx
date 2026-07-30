"use client";

// Temporary glossary tab — an alignment instrument, not documentation. The
// app states its working definition of every term it uses; the teacher
// rewrites any that don't match how she thinks. Her wording wins (and later
// feeds the AI's classification prompts). This tab can retire once teacher
// and app are on the same wavelength.

import { useState, useEffect } from "react";

type Term = {
  key: string;
  term: string;
  category: string;
  definition: string;
  edited: boolean;
  defaultDefinition: string;
};

export default function GlossaryPage() {
  const [terms, setTerms] = useState<Term[]>([]);
  const [loading, setLoading] = useState(true);
  const [editingKey, setEditingKey] = useState<string | null>(null);
  const [draft, setDraft] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function load() {
    try {
      const res = await fetch("/api/glossary");
      const data = await res.json();
      setTerms(data.terms ?? []);
    } catch (err) {
      console.error("Failed to load glossary", err);
    } finally {
      setLoading(false);
    }
  }
  useEffect(() => {
    load();
  }, []);

  async function save(termKey: string, definition: string) {
    setSaving(true);
    setError(null);
    try {
      const res = await fetch("/api/glossary", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ termKey, definition }),
      });
      if (!res.ok) {
        const body = (await res.json().catch(() => null)) as { error?: string } | null;
        throw new Error(body?.error ?? `Save failed (${res.status})`);
      }
      setEditingKey(null);
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Save failed");
    } finally {
      setSaving(false);
    }
  }

  const categories = [...new Set(terms.map((t) => t.category))];

  if (loading) {
    return (
      <div className="min-h-screen bg-zinc-50 dark:bg-zinc-950 flex items-center justify-center">
        <span className="text-sm text-zinc-400">Loading glossary...</span>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-zinc-50 dark:bg-zinc-950">
      <div className="max-w-3xl mx-auto px-6 py-8 space-y-6">
        <div>
          <h1 className="text-lg font-semibold text-zinc-900 dark:text-zinc-50">Glossary</h1>
          <p className="text-sm text-zinc-500 dark:text-zinc-400">
            What the app means by each word it uses
          </p>
        </div>

        <div className="rounded-xl border border-blue-200 dark:border-blue-900 bg-blue-50/50 dark:bg-blue-950/20 px-4 py-3">
          <p className="text-sm text-blue-800 dark:text-blue-300">
            These are the app&apos;s <strong>best guesses</strong> at what each term means,
            based on how your materials are organized. If a definition doesn&apos;t match how
            you think about it, <strong>rewrite it in your own words</strong> — your version
            becomes the definition the app uses. Clearing your edit restores the app&apos;s
            guess.
          </p>
        </div>

        {error && <p className="text-sm text-red-600 dark:text-red-400">{error}</p>}

        {categories.map((cat) => (
          <section key={cat}>
            <h2 className="text-xs font-semibold uppercase tracking-wider text-zinc-400 mb-2">
              {cat}
            </h2>
            <div className="space-y-1.5">
              {terms
                .filter((t) => t.category === cat)
                .map((t) => (
                  <div
                    key={t.key}
                    className="rounded-lg border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 px-4 py-3"
                  >
                    <div className="flex items-center gap-2 mb-1">
                      <span className="text-sm font-semibold text-zinc-900 dark:text-zinc-50">
                        {t.term}
                      </span>
                      {t.edited ? (
                        <span className="text-[10px] font-medium uppercase tracking-wider text-emerald-600 dark:text-emerald-400 bg-emerald-50 dark:bg-emerald-950/30 rounded-full px-2 py-0.5">
                          your definition
                        </span>
                      ) : (
                        <span className="text-[10px] font-medium uppercase tracking-wider text-zinc-400 bg-zinc-100 dark:bg-zinc-800 rounded-full px-2 py-0.5">
                          app&apos;s guess
                        </span>
                      )}
                      {editingKey !== t.key && (
                        <button
                          onClick={() => {
                            setEditingKey(t.key);
                            setDraft(t.definition);
                          }}
                          className="ml-auto text-xs text-blue-600 dark:text-blue-400 hover:underline"
                        >
                          {t.edited ? "Edit" : "Correct this"}
                        </button>
                      )}
                    </div>

                    {editingKey === t.key ? (
                      <div className="space-y-2">
                        <textarea
                          value={draft}
                          onChange={(e) => setDraft(e.target.value)}
                          rows={3}
                          autoFocus
                          className="w-full rounded-lg border border-zinc-300 dark:border-zinc-700 bg-zinc-50 dark:bg-zinc-800 px-3 py-2 text-sm text-zinc-900 dark:text-zinc-100 focus:outline-none focus:ring-1 focus:ring-zinc-400 resize-y"
                        />
                        <div className="flex items-center gap-2">
                          <button
                            onClick={() => save(t.key, draft)}
                            disabled={saving}
                            className="text-xs font-medium text-white bg-zinc-900 dark:bg-zinc-100 dark:text-zinc-900 rounded-md px-3 py-1.5 disabled:opacity-50"
                          >
                            {saving ? "Saving…" : "Save"}
                          </button>
                          <button
                            onClick={() => setEditingKey(null)}
                            className="text-xs text-zinc-500 hover:text-zinc-700 dark:hover:text-zinc-300"
                          >
                            Cancel
                          </button>
                          {t.edited && (
                            <button
                              onClick={() => save(t.key, "")}
                              disabled={saving}
                              className="ml-auto text-xs text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-300"
                              title="Remove your edit and restore the app's definition"
                            >
                              Restore app&apos;s guess
                            </button>
                          )}
                        </div>
                      </div>
                    ) : (
                      <p className="text-sm text-zinc-600 dark:text-zinc-400 leading-relaxed">
                        {t.definition}
                      </p>
                    )}
                  </div>
                ))}
            </div>
          </section>
        ))}
      </div>
    </div>
  );
}
