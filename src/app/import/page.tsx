"use client";

// One motion, from the teacher's side: point at a folder, say what it is,
// import. Everything that used to sit around this page — the per-quarter
// "Imported so far" staging cards with their Build/Rebuild buttons, the
// unit-retrofit panel, the summarize-materials pass, the legacy copy-based
// importer — was our architecture showing through as her chores. Import now
// creates the curriculum outright, so there is nothing to stage and nothing to
// come back and finish.

import { useState } from "react";
import { useSession } from "next-auth/react";
import Link from "next/link";
import ImportFromComputer from "@/components/ImportFromComputer";
import ImportPlanner from "@/components/ImportPlanner";

type Source = "drive" | "computer";

const TABS: { id: Source; label: string }[] = [
  { id: "drive", label: "From Google Drive" },
  { id: "computer", label: "From Computer" },
];

export default function ImportPage() {
  const { data: session } = useSession();
  const [source, setSource] = useState<Source>("drive");

  if (!session) {
    return (
      <div className="min-h-screen bg-zinc-50 dark:bg-zinc-950 px-6 py-12">
        <div className="max-w-4xl mx-auto">
          <p className="text-zinc-500 dark:text-zinc-400">
            Please{" "}
            <Link href="/" className="underline">
              sign in
            </Link>{" "}
            to import files.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-zinc-50 dark:bg-zinc-950 px-6 py-12">
      <div className="max-w-5xl mx-auto">
        <h1 className="text-lg font-semibold text-zinc-900 dark:text-zinc-50 mb-1">
          Import Materials
        </h1>
        <p className="text-zinc-500 dark:text-zinc-400 text-sm mb-6">
          Point at a folder or a file, say what it is, and import it
        </p>

        <div className="flex gap-1 mb-8">
          {TABS.map((tab) => (
            <button
              key={tab.id}
              onClick={() => setSource(tab.id)}
              className={`rounded-md px-4 py-2 text-sm font-medium transition-colors ${
                source === tab.id
                  ? "bg-zinc-900 dark:bg-zinc-100 text-white dark:text-zinc-900"
                  : "text-zinc-500 dark:text-zinc-400 hover:text-zinc-700 dark:hover:text-zinc-300 hover:bg-zinc-100 dark:hover:bg-zinc-800"
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>

        {source === "drive" ? <ImportPlanner /> : <ImportFromComputer />}
      </div>
    </div>
  );
}
