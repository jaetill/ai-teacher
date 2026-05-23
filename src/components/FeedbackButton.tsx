// FeedbackButton — Standard 11 Tier 2 custom widget for ai-teacher.
// Renders a small button + modal dialog. Submits to /api/feedback.
"use client";

import { useState } from "react";

export default function FeedbackButton() {
  const [open, setOpen] = useState(false);
  const [status, setStatus] = useState<string>("");
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setSubmitting(true);
    setStatus("Sending...");

    const fd = new FormData(e.currentTarget);
    const payload = {
      type: fd.get("type"),
      description: fd.get("description"),
      page_url: typeof window !== "undefined" ? window.location.href : "",
      user_agent: typeof navigator !== "undefined" ? navigator.userAgent : "",
      email: fd.get("email") || undefined,
      website: fd.get("website") || undefined,
    };

    try {
      const res = await fetch("/api/feedback", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      if (res.ok) {
        const data = await res.json();
        setStatus(`Thanks! Reference: ${data.id}`);
        setTimeout(() => setOpen(false), 1800);
      } else if (res.status === 429) {
        setStatus("Too many submissions; please try again later.");
        setSubmitting(false);
      } else if (res.status === 400) {
        const data = await res.json().catch(() => ({}));
        setStatus(data.detail || "Validation error.");
        setSubmitting(false);
      } else {
        setStatus("Could not submit feedback. Please try again.");
        setSubmitting(false);
      }
    } catch {
      setStatus("Network error. Please check your connection.");
      setSubmitting(false);
    }
  }

  return (
    <>
      <button
        type="button"
        onClick={() => {
          setStatus("");
          setSubmitting(false);
          setOpen(true);
        }}
        aria-label="Send feedback"
        style={{
          position: "fixed",
          bottom: "1rem",
          left: "1rem",
          zIndex: 9999,
          padding: ".5rem 1rem",
          background: "#4f46e5",
          color: "white",
          border: "none",
          borderRadius: 6,
          cursor: "pointer",
          fontSize: ".875rem",
          boxShadow: "0 2px 8px rgba(0,0,0,0.15)",
        }}
      >
        Feedback
      </button>

      {open && (
        <div
          role="dialog"
          aria-modal="true"
          style={{
            position: "fixed",
            inset: 0,
            background: "rgba(0,0,0,0.4)",
            zIndex: 10000,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
          }}
        >
          <form
            onSubmit={handleSubmit}
            style={{
              display: "flex",
              flexDirection: "column",
              gap: ".75rem",
              minWidth: 320,
              maxWidth: 480,
              padding: "1rem",
              background: "white",
              borderRadius: 8,
            }}
          >
            <h3 style={{ margin: 0, fontSize: "1.125rem" }}>Send feedback</h3>

            <label style={{ display: "flex", flexDirection: "column", gap: ".25rem", fontSize: ".875rem" }}>
              Type
              <select
                name="type"
                required
                defaultValue="bug"
                style={{ padding: ".5rem", border: "1px solid #cbd5e1", borderRadius: 4 }}
              >
                <option value="bug">Bug</option>
                <option value="feature">Feature request</option>
                <option value="other">Other</option>
              </select>
            </label>

            <label style={{ display: "flex", flexDirection: "column", gap: ".25rem", fontSize: ".875rem" }}>
              What happened? (10-2000 characters)
              <textarea
                name="description"
                rows={5}
                minLength={10}
                maxLength={2000}
                required
                style={{ padding: ".5rem", border: "1px solid #cbd5e1", borderRadius: 4, fontFamily: "inherit" }}
              />
            </label>

            <label style={{ display: "flex", flexDirection: "column", gap: ".25rem", fontSize: ".875rem" }}>
              Email (optional, for follow-up)
              <input
                type="email"
                name="email"
                placeholder="optional"
                style={{ padding: ".5rem", border: "1px solid #cbd5e1", borderRadius: 4 }}
              />
            </label>

            <input
              type="text"
              name="website"
              tabIndex={-1}
              autoComplete="off"
              aria-hidden
              style={{ position: "absolute", left: -9999 }}
            />

            <div style={{ display: "flex", gap: ".5rem", justifyContent: "flex-end", marginTop: ".5rem" }}>
              <button
                type="button"
                onClick={() => setOpen(false)}
                style={{
                  padding: ".5rem 1rem",
                  background: "#e2e8f0",
                  color: "#1e293b",
                  border: "none",
                  borderRadius: 4,
                  cursor: "pointer",
                }}
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={submitting}
                style={{
                  padding: ".5rem 1rem",
                  background: "#4f46e5",
                  color: "white",
                  border: "none",
                  borderRadius: 4,
                  cursor: "pointer",
                }}
              >
                Submit
              </button>
            </div>

            {status && (
              <p style={{ margin: 0, fontSize: ".75rem", color: "#64748b", minHeight: "1.25em" }}>{status}</p>
            )}
            <small style={{ color: "#94a3b8" }}>
              We collect only what you type. Email is optional and used only to follow up.
            </small>
          </form>
        </div>
      )}
    </>
  );
}