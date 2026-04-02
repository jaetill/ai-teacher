"use client";

import { useState } from "react";
import ReactMarkdown from "react-markdown";

// ── Quick-fill suggestions ────────────────────────────────────────────────────

const STUDENT_SUGGESTIONS = [
  "Reads about 2 grade levels below, gets overwhelmed by long passages",
  "Finishes early and needs more challenge",
  "Struggles with open-ended prompts, needs more structure",
  "Strong reader but has difficulty expressing ideas in writing",
  "Needs instructions broken into smaller steps",
];

const OUTPUT_SUGGESTIONS = [
  "Simplified version with shorter sentences and easier vocabulary",
  "Scaffolded version with sentence frames and a word bank",
  "Chunked into smaller steps with checkboxes",
  "Enriched version with deeper thinking questions",
  "Alternative way to demonstrate the same learning",
];

// ── Component ─────────────────────────────────────────────────────────────────

export default function DifferentiationPage() {
  const [content, setContent] = useState("");
  const [studentNeed, setStudentNeed] = useState("");
  const [outputRequest, setOutputRequest] = useState("");
  const [grade, setGrade] = useState("");
  const [output, setOutput] = useState("");
  const [generating, setGenerating] = useState(false);
  const [hasGenerated, setHasGenerated] = useState(false);

  async function generate() {
    if (!content || !studentNeed || !outputRequest) return;
    setGenerating(true);
    setOutput("");
    setHasGenerated(true);

    let accumulated = "";

    try {
      const res = await fetch("/api/differentiation", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          content,
          studentNeed,
          outputRequest,
          grade: grade ? parseInt(grade) : undefined,
        }),
      });

      if (!res.ok || !res.body) throw new Error(`API error ${res.status}`);

      const reader = res.body.getReader();
      const decoder = new TextDecoder();

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        accumulated += decoder.decode(value, { stream: true });
        setOutput(accumulated);
      }
    } catch (err) {
      setOutput("Something went wrong. Please try again.");
      console.error(err);
    } finally {
      setGenerating(false);
    }
  }

  function reset() {
    setContent("");
    setStudentNeed("");
    setOutputRequest("");
    setGrade("");
    setOutput("");
    setHasGenerated(false);
  }

  const canGenerate = content && studentNeed && outputRequest && !generating;

  return (
    <div className="min-h-screen bg-zinc-50 dark:bg-zinc-950">
      {/* Header */}
      <header className="border-b border-zinc-200 dark:border-zinc-800 px-6 py-4 bg-white dark:bg-zinc-900">
        <div className="max-w-4xl mx-auto flex items-center justify-between">
          <div>
            <h1 className="text-lg font-semibold text-zinc-900 dark:text-zinc-50">
              Differentiation Engine
            </h1>
            <p className="text-sm text-zinc-500 dark:text-zinc-400">
              Adapt any assignment or reading for a specific student need
            </p>
          </div>
          {hasGenerated && (
            <button
              onClick={reset}
              className="text-sm text-zinc-500 hover:text-zinc-900 dark:hover:text-zinc-100 transition-colors"
            >
              Start over
            </button>
          )}
        </div>
      </header>

      <div className="max-w-4xl mx-auto px-6 py-8 space-y-6">
        {/* ── Form ──────────────────────────────────────────────────────────── */}
        <div className="bg-white dark:bg-zinc-900 rounded-xl border border-zinc-200 dark:border-zinc-800 p-6 space-y-5">
          {/* Original content */}
          <div className="space-y-1.5">
            <label className="text-sm font-medium text-zinc-700 dark:text-zinc-300">
              Original Assignment, Reading, or Activity
            </label>
            <textarea
              rows={7}
              value={content}
              onChange={(e) => setContent(e.target.value)}
              placeholder="Paste the assignment prompt, reading passage, instructions, rubric, or activity here"
              className="w-full resize-none rounded-lg border border-zinc-300 dark:border-zinc-700 bg-zinc-50 dark:bg-zinc-800 px-3 py-2 text-sm text-zinc-900 dark:text-zinc-100 placeholder-zinc-400 focus:outline-none focus:ring-2 focus:ring-zinc-900 dark:focus:ring-zinc-100"
            />
          </div>

          {/* Grade */}
          <div className="space-y-1.5">
            <label className="text-sm font-medium text-zinc-700 dark:text-zinc-300">
              Grade{" "}
              <span className="font-normal text-zinc-400">(optional)</span>
            </label>
            <select
              value={grade}
              onChange={(e) => setGrade(e.target.value)}
              className="w-40 rounded-lg border border-zinc-300 dark:border-zinc-700 bg-zinc-50 dark:bg-zinc-800 px-3 py-2 text-sm text-zinc-900 dark:text-zinc-100 focus:outline-none focus:ring-2 focus:ring-zinc-900 dark:focus:ring-zinc-100"
            >
              <option value="">Any grade</option>
              <option value="6">Grade 6</option>
              <option value="7">Grade 7</option>
              <option value="8">Grade 8</option>
            </select>
          </div>

          {/* Student need */}
          <div className="space-y-2">
            <label className="text-sm font-medium text-zinc-700 dark:text-zinc-300">
              Describe the Student&apos;s Need
            </label>
            <textarea
              rows={2}
              value={studentNeed}
              onChange={(e) => setStudentNeed(e.target.value)}
              placeholder="e.g. Reads about 2 grade levels below, gets overwhelmed by long passages"
              className="w-full resize-none rounded-lg border border-zinc-300 dark:border-zinc-700 bg-zinc-50 dark:bg-zinc-800 px-3 py-2 text-sm text-zinc-900 dark:text-zinc-100 placeholder-zinc-400 focus:outline-none focus:ring-2 focus:ring-zinc-900 dark:focus:ring-zinc-100"
            />
            <div className="flex flex-wrap gap-2">
              {STUDENT_SUGGESTIONS.map((s) => (
                <button
                  key={s}
                  onClick={() => setStudentNeed(s)}
                  className="text-xs px-2.5 py-1 rounded-full border border-zinc-200 dark:border-zinc-700 text-zinc-500 dark:text-zinc-400 hover:border-zinc-400 dark:hover:border-zinc-500 hover:text-zinc-700 dark:hover:text-zinc-300 transition-colors"
                >
                  {s}
                </button>
              ))}
            </div>
          </div>

          {/* Output request */}
          <div className="space-y-2">
            <label className="text-sm font-medium text-zinc-700 dark:text-zinc-300">
              What Do You Need?
            </label>
            <textarea
              rows={2}
              value={outputRequest}
              onChange={(e) => setOutputRequest(e.target.value)}
              placeholder="e.g. Simplified version with shorter sentences and easier vocabulary"
              className="w-full resize-none rounded-lg border border-zinc-300 dark:border-zinc-700 bg-zinc-50 dark:bg-zinc-800 px-3 py-2 text-sm text-zinc-900 dark:text-zinc-100 placeholder-zinc-400 focus:outline-none focus:ring-2 focus:ring-zinc-900 dark:focus:ring-zinc-100"
            />
            <div className="flex flex-wrap gap-2">
              {OUTPUT_SUGGESTIONS.map((s) => (
                <button
                  key={s}
                  onClick={() => setOutputRequest(s)}
                  className="text-xs px-2.5 py-1 rounded-full border border-zinc-200 dark:border-zinc-700 text-zinc-500 dark:text-zinc-400 hover:border-zinc-400 dark:hover:border-zinc-500 hover:text-zinc-700 dark:hover:text-zinc-300 transition-colors"
                >
                  {s}
                </button>
              ))}
            </div>
          </div>

          <button
            onClick={generate}
            disabled={!canGenerate}
            className="w-full h-11 rounded-xl bg-zinc-900 dark:bg-zinc-100 text-white dark:text-zinc-900 text-sm font-medium disabled:opacity-40 hover:bg-zinc-700 dark:hover:bg-zinc-300 transition-colors"
          >
            Adapt This Material
          </button>
        </div>

        {/* ── Output ────────────────────────────────────────────────────────── */}
        {hasGenerated && (
          <div className="bg-white dark:bg-zinc-900 rounded-xl border border-zinc-200 dark:border-zinc-800 p-6">
            {generating && !output && (
              <div className="flex items-center gap-2 text-sm text-zinc-400">
                <span className="inline-block w-1.5 h-4 bg-zinc-400 animate-pulse" />
                Adapting...
              </div>
            )}
            <div className="prose prose-zinc dark:prose-invert max-w-none text-sm leading-relaxed">
              <ReactMarkdown>{output}</ReactMarkdown>
              {generating && output && (
                <span className="inline-block w-1.5 h-4 ml-0.5 bg-zinc-400 animate-pulse align-middle" />
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
