"use client";

import { useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import type { EditorAssessment } from "@/types/curriculum-editor";
import InlineEdit from "./InlineEdit";
import TypeDropdown from "./TypeDropdown";

const ASSESSMENT_TYPES = [
  { value: "formative", label: "Formative" },
  { value: "summative", label: "Summative" },
  { value: "diagnostic", label: "Diagnostic" },
  { value: "exit_ticket", label: "Exit Ticket" },
];

type Props = {
  assessment: EditorAssessment;
  onUpdateTitle: (title: string) => void;
  onUpdateType: (assessmentType: string) => void;
  onRetype: () => void;
};

export default function DraggableAssessmentRow({
  assessment,
  onUpdateTitle,
  onUpdateType,
  onRetype,
}: Props) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: assessment.id, data: { type: "assessment", unitId: null } });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.3 : 1,
  };

  return (
    <div
      ref={setNodeRef}
      style={style}
      className="flex items-center gap-3 rounded-lg border border-amber-200/60 dark:border-amber-800/30 bg-amber-50/50 dark:bg-amber-950/10 px-3 py-2 group hover:bg-amber-50 dark:hover:bg-amber-950/20 transition-colors"
    >
      {/* Drag handle */}
      <button
        {...attributes}
        {...listeners}
        className="cursor-grab active:cursor-grabbing text-amber-300 dark:text-amber-700 hover:text-amber-500 shrink-0 opacity-0 group-hover:opacity-100 transition-opacity"
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

      {/* Assessment icon */}
      <span className="w-6 h-6 rounded-md bg-amber-100 dark:bg-amber-900/40 flex items-center justify-center shrink-0">
        <svg width="12" height="12" viewBox="0 0 16 16" fill="currentColor" className="text-amber-600 dark:text-amber-400">
          <path d="M4 0a2 2 0 00-2 2v12a2 2 0 002 2h8a2 2 0 002-2V4.5L9.5 0H4zm5.5 1.5L13 5h-2.5a1 1 0 01-1-1V1.5zM5 7h6v1H5V7zm0 2h6v1H5V9zm0 2h4v1H5v-1z" />
        </svg>
      </span>

      {/* Title */}
      <div className="flex-1 min-w-0">
        <InlineEdit
          value={assessment.title}
          onSave={onUpdateTitle}
          className="text-[13px] text-zinc-800 dark:text-zinc-100"
        />
      </div>

      {/* Type badge */}
      <TypeDropdown
        value={assessment.assessmentType}
        options={ASSESSMENT_TYPES}
        onChange={onUpdateType}
        className="bg-amber-100/80 dark:bg-amber-900/30 border-amber-200 dark:border-amber-800/50 text-amber-700 dark:text-amber-300"
      />

      {/* Actions */}
      <div className="flex items-center gap-1.5 shrink-0">
        {assessment.materialCount > 0 && (
          <span className="inline-flex items-center gap-1 text-[10px] font-medium text-zinc-400 bg-zinc-100 dark:bg-zinc-800 rounded-full px-2 py-0.5">
            <svg width="10" height="10" viewBox="0 0 16 16" fill="currentColor" className="opacity-50">
              <path d="M14.5 13.5h-13A1.5 1.5 0 010 12V4a1.5 1.5 0 011.5-1.5h4.586a1 1 0 01.707.293L8.5 4.5h6A1.5 1.5 0 0116 6v6a1.5 1.5 0 01-1.5 1.5z" />
            </svg>
            {assessment.materialCount}
          </span>
        )}
        <button
          onClick={onRetype}
          className="text-[10px] text-zinc-300 dark:text-zinc-600 hover:text-blue-500 dark:hover:text-blue-400 opacity-0 group-hover:opacity-100 transition-all ml-1"
          title="Convert to lesson"
        >
          make lesson
        </button>
      </div>
    </div>
  );
}
