"use client";

import { useState, useRef, useEffect } from "react";

type Props = {
  value: string;
  onSave: (value: string) => void;
  className?: string;
  inputClassName?: string;
  placeholder?: string;
  // Render a full-width, multi-row textarea instead of a single-line input.
  // Use for prose fields like a unit summary.
  multiline?: boolean;
};

export default function InlineEdit({
  value,
  onSave,
  className = "",
  inputClassName = "",
  placeholder = "",
  multiline = false,
}: Props) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(value);
  const inputRef = useRef<HTMLInputElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    if (!editing) return;
    if (multiline) {
      // Focus at the end (no select-all — replacing a whole paragraph by
      // accident is worse than repositioning the cursor).
      const el = textareaRef.current;
      el?.focus();
      if (el) el.selectionStart = el.selectionEnd = el.value.length;
    } else {
      inputRef.current?.focus();
      inputRef.current?.select();
    }
  }, [editing, multiline]);

  useEffect(() => {
    setDraft(value);
  }, [value]);

  function commit() {
    setEditing(false);
    const trimmed = draft.trim();
    if (trimmed && trimmed !== value) {
      onSave(trimmed);
    } else {
      setDraft(value);
    }
  }

  if (!editing) {
    return (
      <span
        onClick={() => setEditing(true)}
        className={`cursor-pointer hover:bg-zinc-100 dark:hover:bg-zinc-800 rounded px-1 -mx-1 ${className} ${
          value ? "" : "text-zinc-400 dark:text-zinc-500 italic"
        }`}
        title="Click to edit"
      >
        {value || placeholder}
      </span>
    );
  }

  if (multiline) {
    return (
      <textarea
        ref={textareaRef}
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        onBlur={commit}
        onKeyDown={(e) => {
          // Enter makes a new line here; Escape cancels; click-away (blur) saves.
          if (e.key === "Escape") {
            setDraft(value);
            setEditing(false);
          }
        }}
        rows={4}
        className={`w-full rounded border border-zinc-300 dark:border-zinc-600 bg-white dark:bg-zinc-800 px-2 py-1.5 text-sm leading-snug resize-y focus:outline-none focus:ring-1 focus:ring-zinc-400 ${inputClassName}`}
      />
    );
  }

  return (
    <input
      ref={inputRef}
      value={draft}
      onChange={(e) => setDraft(e.target.value)}
      onBlur={commit}
      onKeyDown={(e) => {
        if (e.key === "Enter") commit();
        if (e.key === "Escape") {
          setDraft(value);
          setEditing(false);
        }
      }}
      className={`rounded border border-zinc-300 dark:border-zinc-600 bg-white dark:bg-zinc-800 px-1.5 py-0.5 text-sm focus:outline-none focus:ring-1 focus:ring-zinc-400 ${inputClassName}`}
    />
  );
}
