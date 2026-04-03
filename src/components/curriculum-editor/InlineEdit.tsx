"use client";

import { useState, useRef, useEffect } from "react";

type Props = {
  value: string;
  onSave: (value: string) => void;
  className?: string;
  inputClassName?: string;
};

export default function InlineEdit({ value, onSave, className = "", inputClassName = "" }: Props) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(value);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (editing) {
      inputRef.current?.focus();
      inputRef.current?.select();
    }
  }, [editing]);

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
        className={`cursor-pointer hover:bg-zinc-100 dark:hover:bg-zinc-800 rounded px-1 -mx-1 ${className}`}
        title="Click to edit"
      >
        {value}
      </span>
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
