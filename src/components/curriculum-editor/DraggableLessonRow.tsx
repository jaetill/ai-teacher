"use client";

import { useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import type { EditorLesson } from "@/types/curriculum-editor";
import InlineEdit from "./InlineEdit";

type Props = {
  lesson: EditorLesson;
  onUpdateTitle: (title: string) => void;
  onRetype: () => void;
};

export default function DraggableLessonRow({ lesson, onUpdateTitle, onRetype }: Props) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: lesson.id, data: { type: "lesson", unitId: null } });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.3 : 1,
  };

  return (
    <div
      ref={setNodeRef}
      style={style}
      className="flex items-center gap-3 rounded-lg px-3 py-2 group hover:bg-zinc-50 dark:hover:bg-zinc-800/50 transition-colors"
    >
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
          <span
            className="inline-flex items-center gap-1 text-[10px] font-medium text-zinc-400 dark:text-zinc-500 bg-zinc-100 dark:bg-zinc-800 rounded-full px-2 py-0.5"
            title={`${lesson.materialCount} materials attached`}
          >
            <svg width="10" height="10" viewBox="0 0 16 16" fill="currentColor" className="opacity-50">
              <path d="M14.5 13.5h-13A1.5 1.5 0 010 12V4a1.5 1.5 0 011.5-1.5h4.586a1 1 0 01.707.293L8.5 4.5h6A1.5 1.5 0 0116 6v6a1.5 1.5 0 01-1.5 1.5z" />
            </svg>
            {lesson.materialCount}
          </span>
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
  );
}
