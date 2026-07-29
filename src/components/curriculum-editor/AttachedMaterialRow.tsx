"use client";

import { useDraggable } from "@dnd-kit/core";
import type { EditorMaterialLink } from "@/types/curriculum-editor";

const ROLE_OPTIONS = [
  { value: "primary", label: "Primary" },
  { value: "supporting", label: "Supporting" },
  { value: "teacher_reference", label: "Reference" },
];

const MATERIAL_TYPE_OPTIONS = [
  { value: "reading", label: "Reading" },
  { value: "activity", label: "Activity" },
  { value: "rubric", label: "Rubric" },
  { value: "lesson", label: "Lesson" },
  { value: "assessment", label: "Assessment" },
  { value: "resource", label: "Resource" },
  { value: "curriculum", label: "Curriculum" },
  { value: "other", label: "Other" },
];

const TYPE_COLORS: Record<string, string> = {
  reading: "text-rose-700 dark:text-rose-300",
  activity: "text-blue-700 dark:text-blue-300",
  rubric: "text-violet-700 dark:text-violet-300",
  lesson: "text-orange-700 dark:text-orange-300",
  assessment: "text-teal-700 dark:text-teal-300",
  resource: "text-cyan-700 dark:text-cyan-300",
  curriculum: "text-emerald-700 dark:text-emerald-300",
  other: "text-zinc-500 dark:text-zinc-400",
};

const ROLE_COLORS: Record<string, string> = {
  primary: "text-blue-600 dark:text-blue-400",
  supporting: "text-zinc-500 dark:text-zinc-400",
  teacher_reference: "text-violet-600 dark:text-violet-400",
};

// Per-variant chrome so a material row looks at home inside either a lesson
// (zinc) or an assessment (amber) block.
const VARIANTS = {
  lesson: {
    row: "bg-zinc-50 dark:bg-zinc-800/60",
    selectBorder:
      "hover:border-zinc-200 dark:hover:border-zinc-700 focus:ring-zinc-400",
  },
  assessment: {
    row: "bg-amber-50/80 dark:bg-amber-950/20",
    selectBorder:
      "hover:border-amber-200 dark:hover:border-amber-800/50 focus:ring-amber-400",
  },
} as const;

type Props = {
  material: EditorMaterialLink;
  // Where this material is attached right now — the drag source.
  fromType: "lesson" | "assessment";
  fromId: string;
  variant: keyof typeof VARIANTS;
  onDetach: (attachmentId: string) => void;
  onUpdate: (attachmentId: string, fields: { role?: string; materialType?: string }) => void;
};

export default function AttachedMaterialRow({
  material,
  fromType,
  fromId,
  variant,
  onDetach,
  onUpdate,
}: Props) {
  const v = VARIANTS[variant];
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({
    id: `att-${material.attachmentId}`,
    data: {
      type: "attached-material",
      attachmentId: material.attachmentId,
      materialId: material.materialId,
      fromType,
      fromId,
      label: material.title,
    },
  });

  return (
    <div
      ref={setNodeRef}
      className={`flex items-center gap-2 py-1 px-2.5 rounded-md text-[12px] ${v.row} ${
        isDragging ? "opacity-30" : ""
      }`}
    >
      {/* Drag handle — carries the drag listeners so the selects/links stay clickable */}
      <button
        {...attributes}
        {...listeners}
        className="cursor-grab active:cursor-grabbing text-zinc-300 dark:text-zinc-600 hover:text-zinc-500 dark:hover:text-zinc-400 shrink-0 transition-colors"
        title="Drag to another lesson or assessment"
      >
        <svg width="11" height="11" viewBox="0 0 14 14" fill="currentColor">
          <rect x="2" y="1" width="3.5" height="1.5" rx="0.5" />
          <rect x="8.5" y="1" width="3.5" height="1.5" rx="0.5" />
          <rect x="2" y="4.5" width="3.5" height="1.5" rx="0.5" />
          <rect x="8.5" y="4.5" width="3.5" height="1.5" rx="0.5" />
          <rect x="2" y="8" width="3.5" height="1.5" rx="0.5" />
          <rect x="8.5" y="8" width="3.5" height="1.5" rx="0.5" />
        </svg>
      </button>
      <select
        value={material.role}
        onChange={(e) => onUpdate(material.attachmentId, { role: e.target.value })}
        className={`text-[9px] font-medium uppercase tracking-wider bg-transparent border border-transparent rounded px-1 py-0.5 focus:outline-none focus:ring-1 cursor-pointer ${v.selectBorder} ${ROLE_COLORS[material.role] ?? ROLE_COLORS.supporting}`}
      >
        {ROLE_OPTIONS.map((opt) => (
          <option key={opt.value} value={opt.value}>{opt.label}</option>
        ))}
      </select>
      <span className="flex-1 min-w-0 truncate text-zinc-700 dark:text-zinc-300">
        {material.driveWebUrl ? (
          <a
            href={material.driveWebUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="hover:text-blue-600 dark:hover:text-blue-400 hover:underline"
            onClick={(e) => e.stopPropagation()}
          >
            {material.title}
          </a>
        ) : (
          material.title
        )}
      </span>
      <select
        value={material.materialType}
        onChange={(e) => onUpdate(material.attachmentId, { materialType: e.target.value })}
        className={`text-[9px] font-medium bg-transparent border border-transparent rounded px-1 py-0.5 focus:outline-none focus:ring-1 cursor-pointer shrink-0 ${v.selectBorder} ${TYPE_COLORS[material.materialType] ?? TYPE_COLORS.other}`}
      >
        {MATERIAL_TYPE_OPTIONS.map((opt) => (
          <option key={opt.value} value={opt.value}>{opt.label}</option>
        ))}
      </select>
      <button
        onClick={() => onDetach(material.attachmentId)}
        className="text-zinc-300 dark:text-zinc-600 hover:text-red-500 dark:hover:text-red-400 shrink-0 transition-colors"
        title="Unlink this material"
      >
        <svg width="12" height="12" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
          <path d="M4 4l8 8M12 4l-8 8" />
        </svg>
      </button>
    </div>
  );
}
