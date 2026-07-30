"use client";

type Props = {
  value: string;
  options: { value: string; label: string }[];
  onChange: (value: string) => void;
  className?: string;
};

export default function TypeDropdown({ value, options, onChange, className = "" }: Props) {
  return (
    <select
      value={value}
      onChange={(e) => onChange(e.target.value)}
      className={`rounded border border-zinc-200 dark:border-zinc-700 bg-zinc-50 dark:bg-zinc-800 px-1.5 py-0.5 text-xs text-zinc-600 dark:text-zinc-400 focus:outline-none focus:ring-1 focus:ring-zinc-400 ${className}`}
    >
      {options.map((opt) => (
        <option
          key={opt.value}
          value={opt.value}
          // Native dropdown popups don't inherit theme context reliably —
          // without explicit colors the options rendered near-invisible
          // (pale text on the OS popup background).
          className="bg-white text-zinc-900 dark:bg-zinc-900 dark:text-zinc-100"
        >
          {opt.label}
        </option>
      ))}
    </select>
  );
}
