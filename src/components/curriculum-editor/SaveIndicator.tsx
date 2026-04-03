"use client";

type Props = {
  status: "idle" | "saving" | "saved" | "error";
};

export default function SaveIndicator({ status }: Props) {
  if (status === "idle") return null;

  const config = {
    saving: {
      bg: "bg-zinc-100 dark:bg-zinc-800",
      text: "text-zinc-500 dark:text-zinc-400",
      label: "Saving...",
    },
    saved: {
      bg: "bg-emerald-50 dark:bg-emerald-950/30",
      text: "text-emerald-600 dark:text-emerald-400",
      label: "Saved",
    },
    error: {
      bg: "bg-red-50 dark:bg-red-950/30",
      text: "text-red-600 dark:text-red-400",
      label: "Save failed",
    },
  };

  const c = config[status];

  return (
    <span className={`inline-flex items-center gap-1.5 text-[11px] font-medium rounded-full px-3 py-1 ${c.bg} ${c.text} transition-all`}>
      {status === "saving" && (
        <svg width="12" height="12" viewBox="0 0 12 12" className="animate-spin">
          <circle cx="6" cy="6" r="4.5" fill="none" stroke="currentColor" strokeWidth="1.5" strokeDasharray="20" strokeDashoffset="5" />
        </svg>
      )}
      {status === "saved" && (
        <svg width="12" height="12" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
          <path d="M2.5 6.5L5 9l4.5-6" />
        </svg>
      )}
      {c.label}
    </span>
  );
}
