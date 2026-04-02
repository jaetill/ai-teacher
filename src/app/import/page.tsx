"use client";

import { useState } from "react";
import { useSession } from "next-auth/react";
import Link from "next/link";
import ImportFromComputer from "@/components/ImportFromComputer";
import ImportFromDrive from "@/components/ImportFromDrive";

type Source = "drive" | "computer";

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
          AI classifies your files and organizes them into the right Drive folders
        </p>

        {/* ── Source tabs ─── */}
        <div className="flex gap-1 mb-8">
          <button
            onClick={() => setSource("drive")}
            className={`rounded-md px-4 py-2 text-sm font-medium transition-colors ${
              source === "drive"
                ? "bg-zinc-900 dark:bg-zinc-100 text-white dark:text-zinc-900"
                : "text-zinc-500 dark:text-zinc-400 hover:text-zinc-700 dark:hover:text-zinc-300 hover:bg-zinc-100 dark:hover:bg-zinc-800"
            }`}
          >
            From Google Drive
          </button>
          <button
            onClick={() => setSource("computer")}
            className={`rounded-md px-4 py-2 text-sm font-medium transition-colors ${
              source === "computer"
                ? "bg-zinc-900 dark:bg-zinc-100 text-white dark:text-zinc-900"
                : "text-zinc-500 dark:text-zinc-400 hover:text-zinc-700 dark:hover:text-zinc-300 hover:bg-zinc-100 dark:hover:bg-zinc-800"
            }`}
          >
            From Computer
          </button>
        </div>

        {source === "drive" ? <ImportFromDrive /> : <ImportFromComputer />}
      </div>
    </div>
  );
}
