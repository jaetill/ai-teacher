"use client";

import { useState } from "react";
import { useSortable } from "@dnd-kit/sortable";
import { useDroppable } from "@dnd-kit/core";
import { CSS } from "@dnd-kit/utilities";
import type { EditorLesson } from "@/types/curriculum-editor";
import InlineEdit from "./InlineEdit";

const ROLE_OPTIONS = [
  { value: "primary", label: "Primary" },
  { value: "supporting", label: "Supporting" },
  { value: "teacher_reference", label: "Reference" },
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

type Props = {
  lesson: EditorLesson;
  onUpdateTitle: (title: string) => void;
  onRetype: () => void;
  onDetachMaterial: (attachmentId: string) => void;
  onUpdateMaterial: (attachmentId: string, fields: { role?: string; materialType?: string }) => void;
};

export default function DraggableLessonRow({ lesson, onUpdateTitle, onRetype, onDetachMaterial, onUpdateMaterial }: Props) {
  const [expanded, setExpanded] = useState(false);
  const {
    attributes,
    listeners,
    setNodeRef: setSortableRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: lesson.id, data: { type: "lesson", unitId: null } });

  // Also register as a droppable target for pool materials
  const { setNodeRef: setDropRef, isOver: isDropTarget } = useDroppable({
    id: `lesson-drop-${lesson.id}`,
    data: { type: "lesson", lessonId: lesson.id },
  });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.3 : 1,
  };

  return (
    <div
      ref={(node) => {
        setSortableRef(node);
        setDropRef(node);
      }}
      style={style}
      className={`rounded-lg group transition-colors ${
        isDropTarget
          ? "ring-2 ring-blue-400/50 bg-blue-50/50 dark:bg-blue-950/20"
          : "hover:bg-zinc-50 dark:hover:bg-zinc-800/50"
      }`}
    >
      <div className="flex items-center gap-3 px-3 py-2">
        {/* Drag handle */}
        <button
          {...attributes}
          {...listeners}
          className="cursor-grab active:cursor-grabbing text-zinc-300 dark:text-zinc-500 hover:text-zinc-500 dark:hover:text-zinc-300 shrink-0 transition-colors"
          title="Drag to reorder"
        >
          <svg width="14" height="14" viewBox="0 0 14 14" fill="currentColor">
            <rect x="2" y="1" width="3.5" height="1.5" rx="0.5" />
            <rect x="8.5" y="1" width="3.5" height="1.5" rx="0.5" />
            <rect x="2" y="4.5" width="3.5" height="1.5" rx="0.5" />
            <rect x="8.5" y="4.5" width="3.5" height="1.5" rx="0.5" />
            <rect x="2" y="8" width="3.5" height="1.5" rx="0.5" />
            <rect x="8.5" y="8" width="3.5" height="1.5" rx="0.5" />
            <rect x="2" y="11.5" width="3.5" height="1.5" rx="0.5" />
            <rect x="8.5" y="11.5" width="3.5" height="1.5" rx="0.5" />
          </svg>
        </button>

        {/* Sort order badge */}
        <span className="text-[11px] font-medium text-zinc-400 dark:text-zinc-500 bg-zinc-100 dark:bg-zinc-800 rounded-md w-6 h-6 flex items-center justify-center shrink-0">
          {lesson.sortOrder}
        </span>

        {/* Title */}
        <div className="flex-1 min-w-0">
          <InlineEdit
            value={lesson.title}
            onSave={onUpdateTitle}
            className="text-[13px] text-zinc-800 dark:text-zinc-100"
          />
        </div>

        {/* Metadata pills */}
        <div className="flex items-center gap-1.5 shrink-0">
          {lesson.materialCount > 0 && (
            <button
              onClick={() => setExpanded(!expanded)}
              className="inline-flex items-center gap-1 text-[10px] font-medium text-zinc-400 dark:text-zinc-500 bg-zinc-100 dark:bg-zinc-800 rounded-full px-2 py-0.5 hover:bg-zinc-200 dark:hover:bg-zinc-700 transition-colors"
              title={`${lesson.materialCount} materials — click to ${expanded ? "collapse" : "expand"}`}
            >
              <svg width="10" height="10" viewBox="0 0 16 16" fill="currentColor" className="opacity-50">
                <path d="M14.5 13.5h-13A1.5 1.5 0 010 12V4a1.5 1.5 0 011.5-1.5h4.586a1 1 0 01.707.293L8.5 4.5h6A1.5 1.5 0 0116 6v6a1.5 1.5 0 01-1.5 1.5z" />
              </svg>
              {lesson.materialCount}
              <svg
                width="8"
                height="8"
                viewBox="0 0 8 8"
                fill="currentColor"
                className={`transition-transform duration-150 ${expanded ? "rotate-180" : ""}`}
              >
                <path d="M1 3l3 3 3-3" stroke="currentColor" strokeWidth="1.5" fill="none" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            </button>
          )}
          {lesson.source === "human" && (
            <span className="text-[10px] font-medium text-emerald-600 dark:text-emerald-400 bg-emerald-50 dark:bg-emerald-950/30 rounded-full px-2 py-0.5">
              from docs
            </span>
          )}
          <button
            onClick={onRetype}
            className="text-[10px] text-zinc-300 dark:text-zinc-600 hover:text-amber-500 dark:hover:text-amber-400 opacity-0 group-hover:opacity-100 transition-all ml-1"
            title="Convert to assessment"
          >
            make assessment
          </button>
        </div>
      </div>

      {/* Expanded materials list */}
      {expanded && lesson.materials.length > 0 && (
        <div className="ml-[62px] mr-3 mb-2 space-y-1">
          {lesson.materials.map((mat) => (
            <div
              key={mat.attachmentId}
              className="flex items-center gap-2 py-1 px-2.5 rounded-md bg-zinc-50 dark:bg-zinc-800/60 text-[12px]"
            >
              <select
                value={mat.role}
                onChange={(e) => onUpdateMaterial(mat.attachmentId, { role: e.target.value })}
                className={`text-[9px] font-medium uppercase tracking-wider bg-transparent border border-transparent hover:border-zinc-200 dark:hover:border-zinc-700 rounded px-1 py-0.5 focus:outline-none focus:ring-1 focus:ring-zinc-400 cursor-pointer ${ROLE_COLORS[mat.role] ?? ROLE_COLORS.supporting}`}
              >
                {ROLE_OPTIONS.map((opt) => (
                  <option key={opt.value} value={opt.value}>{opt.label}</option>
                ))}
              </select>
              <span className="flex-1 min-w-0 truncate text-zinc-700 dark:text-zinc-300">
                {mat.driveWebUrl ? (
                  <a
                    href={mat.driveWebUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="hover:text-blue-600 dark:hover:text-blue-400 hover:underline"
                    onClick={(e) => e.stopPropagation()}
                  >
                    {mat.title}
                  </a>
                ) : (
                  mat.title
                )}
              </span>
              <select
                value={mat.materialType}
                onChange={(e) => onUpdateMaterial(mat.attachmentId, { materialType: e.target.value })}
                className={`text-[9px] font-medium bg-transparent border border-transparent hover:border-zinc-200 dark:hover:border-zinc-700 rounded px-1 py-0.5 focus:outline-none focus:ring-1 focus:ring-zinc-400 cursor-pointer shrink-0 ${TYPE_COLORS[mat.materialType] ?? TYPE_COLORS.other}`}
              >
                {MATERIAL_TYPE_OPTIONS.map((opt) => (
                  <option key={opt.value} value={opt.value}>{opt.label}</option>
                ))}
              </select>
              <button
                onClick={() => onDetachMaterial(mat.attachmentId)}
                className="text-zinc-300 dark:text-zinc-600 hover:text-red-500 dark:hover:text-red-400 shrink-0 transition-colors"
                title="Unlink this material"
              >
                <svg width="12" height="12" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
                  <path d="M4 4l8 8M12 4l-8 8" />
                </svg>
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
