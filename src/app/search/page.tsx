"use client";

// Curriculum-wide search: units, lessons, materials — read-only, owner-scoped.
// "Where does Harrison Bergeron appear?"

import { useState, useRef } from "react";
import Link from "next/link";

type UnitHit = { id: string; title: string; quarter: string | null; grade: number | null };
type LessonHit = {
  id: string;
  title: string;
  unitId: string;
  unitTitle: string | null;
  quarter: string | null;
  grade: number | null;
};
type MaterialHit = {
  id: string;
  title: string;
  materialType: string;
  driveWebUrl: string | null;
  unitId: string | null;
};

type Results = { units: UnitHit[]; lessons: LessonHit[]; materials: MaterialHit[] };

export default function SearchPage() {
  const [q, setQ] = useState("");
  const [results, setResults] = useState<Results | null>(null);
  const [searching, setSearching] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  async function run(term: string) {
    if (term.trim().length < 2) {
      setResults(null);
      return;
    }
    setSearching(true);
    setError(null);
    try {
      const res = await fetch(`/api/search?q=${encodeURIComponent(term.trim())}`);
      if (!res.ok) throw new Error(`Search failed (${res.status})`);
      setResults(await res.json());
    } catch (err) {
      setError(err instanceof Error ? err.message : "Search failed");
    } finally {
      setSearching(false);
    }
  }

  function onChange(value: string) {
    setQ(value);
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => run(value), 300);
  }

  const total = results
    ? results.units.length + results.lessons.length + results.materials.length
    : 0;

  return (
    <div className="min-h-screen bg-zinc-50 dark:bg-zinc-950">
      <div className="max-w-3xl mx-auto px-6 py-8 space-y-6">
        <div>
          <h1 className="text-lg font-semibold text-zinc-900 dark:text-zinc-50">Search</h1>
          <p className="text-sm text-zinc-500 dark:text-zinc-400">
            Find anything across your units, lessons, and materials
          </p>
        </div>

        <input
          autoFocus
          value={q}
          onChange={(e) => onChange(e.target.value)}
          placeholder='Try "Harrison Bergeron" or "persuasive"...'
          className="w-full rounded-xl border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-900 px-4 py-3 text-sm text-zinc-900 dark:text-zinc-100 placeholder-zinc-400 focus:outline-none focus:ring-2 focus:ring-zinc-300 dark:focus:ring-zinc-600"
        />

        {error && <p className="text-sm text-red-600 dark:text-red-400">{error}</p>}
        {searching && <p className="text-sm text-zinc-400">Searching…</p>}

        {results && !searching && (
          <div className="space-y-6">
            <p className="text-xs text-zinc-400">
              {total} result{total === 1 ? "" : "s"} for &ldquo;{results ? q.trim() : ""}&rdquo;
            </p>

            {results.units.length > 0 && (
              <section>
                <h2 className="text-xs font-semibold uppercase tracking-wider text-zinc-400 mb-2">
                  Units
                </h2>
                <div className="space-y-1.5">
                  {results.units.map((u) => (
                    <Link
                      key={u.id}
                      href={`/curriculum/${u.id}`}
                      className="block rounded-lg border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 px-4 py-2.5 text-sm text-zinc-800 dark:text-zinc-200 hover:border-zinc-300 dark:hover:border-zinc-700 transition-colors"
                    >
                      {u.title}
                      <span className="text-xs text-zinc-400 ml-2">
                        {u.grade ? `Grade ${u.grade}` : ""}
                        {u.quarter ? ` · ${u.quarter}` : ""}
                      </span>
                    </Link>
                  ))}
                </div>
              </section>
            )}

            {results.lessons.length > 0 && (
              <section>
                <h2 className="text-xs font-semibold uppercase tracking-wider text-zinc-400 mb-2">
                  Lessons
                </h2>
                <div className="space-y-1.5">
                  {results.lessons.map((l) => (
                    <Link
                      key={l.id}
                      href={`/curriculum/${l.unitId}`}
                      className="block rounded-lg border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 px-4 py-2.5 text-sm text-zinc-800 dark:text-zinc-200 hover:border-zinc-300 dark:hover:border-zinc-700 transition-colors"
                    >
                      {l.title}
                      <span className="text-xs text-zinc-400 ml-2">
                        {l.grade ? `Grade ${l.grade}` : ""}
                        {l.quarter ? ` · ${l.quarter}` : ""}
                        {l.unitTitle ? ` · ${l.unitTitle}` : ""}
                      </span>
                    </Link>
                  ))}
                </div>
              </section>
            )}

            {results.materials.length > 0 && (
              <section>
                <h2 className="text-xs font-semibold uppercase tracking-wider text-zinc-400 mb-2">
                  Materials
                </h2>
                <div className="space-y-1.5">
                  {results.materials.map((m) => (
                    <div
                      key={m.id}
                      className="rounded-lg border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 px-4 py-2.5 text-sm text-zinc-800 dark:text-zinc-200 flex items-center gap-2"
                    >
                      <span className="flex-1 min-w-0 truncate">{m.title}</span>
                      <span className="text-[10px] uppercase tracking-wider text-zinc-400 shrink-0">
                        {m.materialType}
                      </span>
                      {m.unitId && (
                        <Link
                          href={`/curriculum/${m.unitId}`}
                          className="text-xs text-blue-600 dark:text-blue-400 hover:underline shrink-0"
                        >
                          unit
                        </Link>
                      )}
                      {m.driveWebUrl && (
                        <a
                          href={m.driveWebUrl}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-xs text-blue-600 dark:text-blue-400 hover:underline shrink-0"
                        >
                          open ↗
                        </a>
                      )}
                    </div>
                  ))}
                </div>
              </section>
            )}

            {total === 0 && (
              <p className="text-sm text-zinc-400 py-8 text-center">
                Nothing found. Search looks at unit titles and summaries, lesson titles, and
                material titles.
              </p>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
