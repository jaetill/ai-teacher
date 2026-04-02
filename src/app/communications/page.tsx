"use client";

import { useState } from "react";

// ── Gmail compose URL helper ──────────────────────────────────────────────────

function gmailComposeUrl(subject: string, body: string): string {
  return `https://mail.google.com/mail/?view=cm&fs=1&su=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
}

function parseEmail(raw: string): { subject: string; body: string } {
  const lines = raw.split("\n");
  const subjectLine = lines.find((l) => l.startsWith("Subject:"));
  if (!subjectLine) return { subject: "", body: raw };
  const subject = subjectLine.replace(/^Subject:\s*/, "").trim();
  const bodyStart = lines.indexOf(subjectLine) + 1;
  const body = lines
    .slice(bodyStart)
    .join("\n")
    .replace(/^\n+/, "");
  return { subject, body };
}

// ── Component ─────────────────────────────────────────────────────────────────

type Recipient = "parent" | "admin";
type Tone = "positive" | "concerned" | "neutral";

export default function CommunicationsPage() {
  const [recipient, setRecipient] = useState<Recipient>("parent");
  const [recipientName, setRecipientName] = useState("");
  const [studentName, setStudentName] = useState("");
  const [situation, setSituation] = useState("");
  const [tone, setTone] = useState<Tone>("neutral");
  const [output, setOutput] = useState("");
  const [generating, setGenerating] = useState(false);
  const [hasGenerated, setHasGenerated] = useState(false);
  const [copied, setCopied] = useState(false);

  const { subject, body } = parseEmail(output);

  async function generate() {
    if (!situation) return;
    setGenerating(true);
    setOutput("");
    setHasGenerated(true);
    setCopied(false);

    let accumulated = "";

    try {
      const res = await fetch("/api/communications", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          recipient,
          situation,
          tone,
          studentName: studentName || undefined,
          recipientName: recipientName || undefined,
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

  async function copyToClipboard() {
    await navigator.clipboard.writeText(body);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  function reset() {
    setRecipientName("");
    setStudentName("");
    setSituation("");
    setTone("neutral");
    setOutput("");
    setHasGenerated(false);
    setCopied(false);
  }

  const canGenerate = situation && !generating;

  return (
    <div className="min-h-screen bg-zinc-50 dark:bg-zinc-950">
      {/* Header */}
      <header className="border-b border-zinc-200 dark:border-zinc-800 px-6 py-4 bg-white dark:bg-zinc-900">
        <div className="max-w-3xl mx-auto flex items-center justify-between">
          <div>
            <h1 className="text-lg font-semibold text-zinc-900 dark:text-zinc-50">
              Communication Engine
            </h1>
            <p className="text-sm text-zinc-500 dark:text-zinc-400">
              Draft parent and admin emails from a quick situation description
            </p>
          </div>
          {hasGenerated && (
            <button
              onClick={reset}
              className="text-sm text-zinc-500 hover:text-zinc-900 dark:hover:text-zinc-100 transition-colors"
            >
              New email
            </button>
          )}
        </div>
      </header>

      <div className="max-w-3xl mx-auto px-6 py-8 space-y-6">
        {/* ── Form ──────────────────────────────────────────────────────────── */}
        <div className="bg-white dark:bg-zinc-900 rounded-xl border border-zinc-200 dark:border-zinc-800 p-6 space-y-5">
          {/* Recipient type */}
          <div className="space-y-2">
            <label className="text-sm font-medium text-zinc-700 dark:text-zinc-300">
              To
            </label>
            <div className="flex gap-2">
              {(["parent", "admin"] as Recipient[]).map((r) => (
                <button
                  key={r}
                  onClick={() => setRecipient(r)}
                  className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors border ${
                    recipient === r
                      ? "bg-zinc-900 dark:bg-zinc-100 text-white dark:text-zinc-900 border-zinc-900 dark:border-zinc-100"
                      : "bg-white dark:bg-zinc-800 text-zinc-600 dark:text-zinc-400 border-zinc-200 dark:border-zinc-700 hover:border-zinc-400 dark:hover:border-zinc-500"
                  }`}
                >
                  {r === "parent" ? "Parent / Guardian" : "Administrator"}
                </button>
              ))}
            </div>
          </div>

          {/* Names row */}
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <label className="text-sm font-medium text-zinc-700 dark:text-zinc-300">
                {recipient === "parent" ? "Parent Name" : "Admin Name"}{" "}
                <span className="font-normal text-zinc-400">(optional)</span>
              </label>
              <input
                type="text"
                value={recipientName}
                onChange={(e) => setRecipientName(e.target.value)}
                placeholder={recipient === "parent" ? "e.g. Mrs. Johnson" : "e.g. Dr. Smith"}
                className="w-full rounded-lg border border-zinc-300 dark:border-zinc-700 bg-zinc-50 dark:bg-zinc-800 px-3 py-2 text-sm text-zinc-900 dark:text-zinc-100 placeholder-zinc-400 focus:outline-none focus:ring-2 focus:ring-zinc-900 dark:focus:ring-zinc-100"
              />
            </div>
            <div className="space-y-1.5">
              <label className="text-sm font-medium text-zinc-700 dark:text-zinc-300">
                Student Name{" "}
                <span className="font-normal text-zinc-400">(optional)</span>
              </label>
              <input
                type="text"
                value={studentName}
                onChange={(e) => setStudentName(e.target.value)}
                placeholder="e.g. Marcus"
                className="w-full rounded-lg border border-zinc-300 dark:border-zinc-700 bg-zinc-50 dark:bg-zinc-800 px-3 py-2 text-sm text-zinc-900 dark:text-zinc-100 placeholder-zinc-400 focus:outline-none focus:ring-2 focus:ring-zinc-900 dark:focus:ring-zinc-100"
              />
            </div>
          </div>

          {/* Tone */}
          <div className="space-y-2">
            <label className="text-sm font-medium text-zinc-700 dark:text-zinc-300">
              Tone
            </label>
            <div className="flex gap-2">
              {(
                [
                  { value: "positive", label: "Positive" },
                  { value: "concerned", label: "Concern" },
                  { value: "neutral", label: "Informational" },
                ] as { value: Tone; label: string }[]
              ).map(({ value, label }) => (
                <button
                  key={value}
                  onClick={() => setTone(value)}
                  className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors border ${
                    tone === value
                      ? "bg-zinc-900 dark:bg-zinc-100 text-white dark:text-zinc-900 border-zinc-900 dark:border-zinc-100"
                      : "bg-white dark:bg-zinc-800 text-zinc-600 dark:text-zinc-400 border-zinc-200 dark:border-zinc-700 hover:border-zinc-400 dark:hover:border-zinc-500"
                  }`}
                >
                  {label}
                </button>
              ))}
            </div>
          </div>

          {/* Situation */}
          <div className="space-y-1.5">
            <label className="text-sm font-medium text-zinc-700 dark:text-zinc-300">
              What&apos;s the situation?
            </label>
            <p className="text-xs text-zinc-400">
              Just describe it in plain language — Claude will handle the professional wording
            </p>
            <textarea
              rows={4}
              value={situation}
              onChange={(e) => setSituation(e.target.value)}
              placeholder={
                recipient === "parent"
                  ? "e.g. Marcus has been turning in homework late three weeks in a row. His in-class work is strong so I don't think he's struggling with the material. I want to check in with his parents to see if something's going on at home."
                  : "e.g. I want to let the principal know that the poetry unit ran 2 weeks over schedule and I'm adjusting the pacing guide for Q3. The extra time was worth it — student writing improved significantly."
              }
              className="w-full resize-none rounded-lg border border-zinc-300 dark:border-zinc-700 bg-zinc-50 dark:bg-zinc-800 px-3 py-2 text-sm text-zinc-900 dark:text-zinc-100 placeholder-zinc-400 focus:outline-none focus:ring-2 focus:ring-zinc-900 dark:focus:ring-zinc-100"
            />
          </div>

          <button
            onClick={generate}
            disabled={!canGenerate}
            className="w-full h-11 rounded-xl bg-zinc-900 dark:bg-zinc-100 text-white dark:text-zinc-900 text-sm font-medium disabled:opacity-40 hover:bg-zinc-700 dark:hover:bg-zinc-300 transition-colors"
          >
            Draft Email
          </button>
        </div>

        {/* ── Output ────────────────────────────────────────────────────────── */}
        {hasGenerated && (
          <div className="bg-white dark:bg-zinc-900 rounded-xl border border-zinc-200 dark:border-zinc-800 overflow-hidden">
            {/* Email header bar */}
            {!generating && subject && (
              <div className="border-b border-zinc-100 dark:border-zinc-800 px-5 py-3 flex items-center justify-between gap-4">
                <div className="min-w-0">
                  <span className="text-xs text-zinc-400 mr-2">Subject</span>
                  <span className="text-sm font-medium text-zinc-700 dark:text-zinc-300 truncate">
                    {subject}
                  </span>
                </div>
                <div className="flex gap-2 shrink-0">
                  <button
                    onClick={copyToClipboard}
                    className="text-xs px-3 py-1.5 rounded-lg border border-zinc-200 dark:border-zinc-700 text-zinc-500 dark:text-zinc-400 hover:border-zinc-400 dark:hover:border-zinc-500 transition-colors"
                  >
                    {copied ? "Copied!" : "Copy"}
                  </button>
                  <a
                    href={gmailComposeUrl(subject, body)}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-xs px-3 py-1.5 rounded-lg bg-zinc-900 dark:bg-zinc-100 text-white dark:text-zinc-900 hover:bg-zinc-700 dark:hover:bg-zinc-300 transition-colors"
                  >
                    Open in Gmail →
                  </a>
                </div>
              </div>
            )}

            {/* Email body */}
            <div className="p-6">
              {generating && !output && (
                <div className="flex items-center gap-2 text-sm text-zinc-400">
                  <span className="inline-block w-1.5 h-4 bg-zinc-400 animate-pulse" />
                  Drafting...
                </div>
              )}
              <pre className="text-sm text-zinc-700 dark:text-zinc-300 whitespace-pre-wrap font-sans leading-relaxed">
                {body}
                {generating && output && (
                  <span className="inline-block w-1.5 h-4 ml-0.5 bg-zinc-400 animate-pulse align-middle" />
                )}
              </pre>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
