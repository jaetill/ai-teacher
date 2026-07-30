"use client";

import { useState } from "react";
import { useSortable } from "@dnd-kit/sortable";
import { useDroppable } from "@dnd-kit/core";
import { CSS } from "@dnd-kit/utilities";
import type { EditorLesson } from "@/types/curriculum-editor";
import InlineEdit from "./InlineEdit";
import AttachedMaterialRow from "./AttachedMaterialRow";

type Props = {
  lesson: EditorLesson;
  // Position within the unit (1-based). Shown as the lesson number so it stays
  // gap-free after a delete/move — the stored sortOrder can have gaps, which is
  // fine for ordering but reads wrong as a visible "1, 3, 4".
  displayNumber: number;
  onUpdateTitle: (title: string) => void;
  onUpdateDuration: (durationMinutes: number) => void;
  onRetype: () => void;
  onDelete: () => void;
  onDetachMaterial: (attachmentId: string) => void;
  onUpdateMaterial: (attachmentId: string, fields: { role?: string; materialType?: string }) => void;
};

export default function DraggableLessonRow({
  lesson,
  displayNumber,
  onUpdateTitle,
  onUpdateDuration,
  onRetype,
  onDelete,
  onDetachMaterial,
  onUpdateMaterial,
}: Props) {
  const [expanded, setExpanded] = useState(false);
  const {
    attributes,
    listeners,
    setNodeRef: setSortableRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: lesson.id, data: { type: "lesson", unitId: null, label: lesson.title } });

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
          {displayNumber}
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
          <span className="text-[10px] text-zinc-400 dark:text-zinc-500 shrink-0 flex items-center gap-0.5">
            <InlineEdit
              value={lesson.durationMinutes != null ? String(lesson.durationMinutes) : ""}
              onSave={(v) => {
                const n = parseInt(v, 10);
                if (Number.isInteger(n) && n >= 1 && n <= 1440) onUpdateDuration(n);
              }}
              placeholder="—"
              className="text-[10px] text-zinc-400 dark:text-zinc-500"
            />
            m
          </span>
          <button
            onClick={onRetype}
            className="text-[10px] text-zinc-300 dark:text-zinc-600 hover:text-amber-500 dark:hover:text-amber-400 opacity-0 group-hover:opacity-100 transition-all ml-1"
            title="Convert to assessment"
          >
            make assessment
          </button>
          <button
            onClick={onDelete}
            className="text-zinc-300 dark:text-zinc-600 hover:text-red-500 dark:hover:text-red-400 opacity-0 group-hover:opacity-100 transition-all shrink-0"
            title="Delete lesson"
          >
            <svg width="12" height="12" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
              <path d="M4 4l8 8M12 4l-8 8" />
            </svg>
          </button>
        </div>
      </div>

      {/* Expanded materials list */}
      {expanded && lesson.materials.length > 0 && (
        <div className="ml-[62px] mr-3 mb-2 space-y-1">
          {lesson.materials.map((mat) => (
            <AttachedMaterialRow
              key={mat.attachmentId}
              material={mat}
              fromType="lesson"
              fromId={lesson.id}
              variant="lesson"
              onDetach={onDetachMaterial}
              onUpdate={onUpdateMaterial}
            />
          ))}
        </div>
      )}
    </div>
  );
}
