"use client";

import { useState } from "react";
import {
  SortableContext,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { useDroppable } from "@dnd-kit/core";
import type { EditorUnit } from "@/types/curriculum-editor";
import DraggableLessonRow from "./DraggableLessonRow";
import DraggableAssessmentRow from "./DraggableAssessmentRow";
import InlineEdit from "./InlineEdit";

const QUARTER_STYLES: Record<string, { border: string; bg: string; badge: string }> = {
  Summer: {
    border: "border-l-orange-400 dark:border-l-orange-500",
    bg: "bg-orange-50/40 dark:bg-orange-950/10",
    badge: "bg-orange-100 text-orange-700 dark:bg-orange-900/40 dark:text-orange-300",
  },
  Q1: {
    border: "border-l-blue-400 dark:border-l-blue-500",
    bg: "bg-blue-50/40 dark:bg-blue-950/10",
    badge: "bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300",
  },
  Q2: {
    border: "border-l-violet-400 dark:border-l-violet-500",
    bg: "bg-violet-50/40 dark:bg-violet-950/10",
    badge: "bg-violet-100 text-violet-700 dark:bg-violet-900/40 dark:text-violet-300",
  },
  Q3: {
    border: "border-l-teal-400 dark:border-l-teal-500",
    bg: "bg-teal-50/40 dark:bg-teal-950/10",
    badge: "bg-teal-100 text-teal-700 dark:bg-teal-900/40 dark:text-teal-300",
  },
  Q4: {
    border: "border-l-amber-400 dark:border-l-amber-500",
    bg: "bg-amber-50/40 dark:bg-amber-950/10",
    badge: "bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300",
  },
};

const DEFAULT_STYLE = {
  border: "border-l-zinc-300",
  bg: "",
  badge: "bg-zinc-100 text-zinc-600 dark:bg-zinc-800 dark:text-zinc-400",
};

type Props = {
  unit: EditorUnit;
  onUpdateUnit: (fields: Record<string, unknown>) => void;
  onUpdateLesson: (lessonId: string, fields: Record<string, unknown>) => void;
  onUpdateAssessment: (assessmentId: string, fields: Record<string, unknown>) => void;
  onRetypeLesson: (lessonId: string) => void;
  onRetypeAssessment: (assessmentId: string) => void;
  onDetachMaterial: (attachmentId: string) => void;
  onUpdateMaterial: (attachmentId: string, fields: { role?: string; materialType?: string }) => void;
  onAddLesson: () => void;
  onDeleteUnit: () => void;
  onDeleteLesson: (lessonId: string) => void;
};

export default function UnitColumn({
  unit,
  onUpdateUnit,
  onUpdateLesson,
  onUpdateAssessment,
  onRetypeLesson,
  onRetypeAssessment,
  onDetachMaterial,
  onUpdateMaterial,
  onAddLesson,
  onDeleteUnit,
  onDeleteLesson,
}: Props) {
  const [collapsed, setCollapsed] = useState(false);
  const [confirmingDelete, setConfirmingDelete] = useState(false);

  const { setNodeRef: setDropRef, isOver } = useDroppable({
    id: `unit-drop-${unit.id}`,
    data: { type: "unit-drop", unitId: unit.id },
  });

  const lessonIds = unit.lessons.map((l) => l.id);
  const assessmentIds = unit.assessments.map((a) => a.id);
  const qs = QUARTER_STYLES[unit.quarter ?? ""] ?? DEFAULT_STYLE;

  return (
    <div
      ref={setDropRef}
      className={`rounded-xl border-l-4 border border-zinc-200 dark:border-zinc-800 shadow-sm transition-all ${qs.border} ${
        isOver
          ? "ring-2 ring-blue-400/50 dark:ring-blue-500/50 bg-blue-50/30 dark:bg-blue-950/10"
          : "bg-white dark:bg-zinc-900"
      }`}
    >
      {/* ── Unit header ─── */}
      <button
        onClick={() => setCollapsed(!collapsed)}
        className={`w-full text-left px-5 py-4 flex items-start gap-4 rounded-t-xl transition-colors ${
          collapsed ? "" : qs.bg
        }`}
      >
        <div className="pt-0.5 shrink-0">
          <svg
            width="10"
            height="10"
            viewBox="0 0 10 10"
            fill="currentColor"
            className={`text-zinc-400 transition-transform duration-200 ${collapsed ? "" : "rotate-90"}`}
          >
            <path d="M3 1l5 4-5 4V1z" />
          </svg>
        </div>

        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2.5 flex-wrap">
            {/* Quarter picker — a unit created in the editor starts with no
                quarter and previously had NO way to get one (the badge was
                display-only). Renders as the familiar badge when set, and a
                subtle "quarter?" pill when unset. */}
            <span
              onClick={(e) => e.stopPropagation()}
              onPointerDown={(e) => e.stopPropagation()}
            >
              <select
                value={unit.quarter ?? ""}
                onChange={(e) =>
                  onUpdateUnit({ quarter: e.target.value === "" ? null : e.target.value })
                }
                title="Assign quarter"
                className={`text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full border-0 cursor-pointer appearance-none focus:outline-none focus:ring-1 focus:ring-zinc-400 ${
                  unit.quarter
                    ? qs.badge
                    : "bg-zinc-100 text-zinc-400 dark:bg-zinc-800 dark:text-zinc-500"
                }`}
              >
                <option className="bg-white text-zinc-900 dark:bg-zinc-900 dark:text-zinc-100 font-normal normal-case" value="">quarter?</option>
                <option className="bg-white text-zinc-900 dark:bg-zinc-900 dark:text-zinc-100 font-normal normal-case" value="Summer">Summer</option>
                <option className="bg-white text-zinc-900 dark:bg-zinc-900 dark:text-zinc-100 font-normal normal-case" value="Q1">Q1</option>
                <option className="bg-white text-zinc-900 dark:bg-zinc-900 dark:text-zinc-100 font-normal normal-case" value="Q2">Q2</option>
                <option className="bg-white text-zinc-900 dark:bg-zinc-900 dark:text-zinc-100 font-normal normal-case" value="Q3">Q3</option>
                <option className="bg-white text-zinc-900 dark:bg-zinc-900 dark:text-zinc-100 font-normal normal-case" value="Q4">Q4</option>
              </select>
            </span>
            <span className="text-[13px] font-semibold text-zinc-900 dark:text-zinc-50 leading-snug" onClick={(e) => e.stopPropagation()}>
              <InlineEdit
                value={unit.title}
                onSave={(title) => onUpdateUnit({ title })}
                className="text-[13px] font-semibold text-zinc-900 dark:text-zinc-50"
              />
            </span>
          </div>

          <div className="flex items-center gap-3 mt-1.5 text-xs text-zinc-400">
            <span>{unit.durationWeeks} weeks</span>
            <span className="w-1 h-1 rounded-full bg-zinc-300 dark:bg-zinc-600" />
            <span>{unit.lessons.length} lessons</span>
            {unit.assessments.length > 0 && (
              <>
                <span className="w-1 h-1 rounded-full bg-zinc-300 dark:bg-zinc-600" />
                <span>{unit.assessments.length} assessments</span>
              </>
            )}
          </div>

          {/* Collapsed preview */}
          {collapsed && unit.lessons.length > 0 && (
            <p className="text-xs text-zinc-400/70 mt-2 truncate">
              {unit.lessons.slice(0, 4).map((l) => l.title).join("  /  ")}
              {unit.lessons.length > 4 && "  / ..."}
            </p>
          )}
        </div>
      </button>

      {/* ── Collapsible content ─── */}
      {!collapsed && (
        <div className="px-5 pb-5 pt-1 space-y-4">
          {/* Editable summary + duration */}
          <div className="space-y-1.5">
            <InlineEdit
              value={unit.summary || ""}
              onSave={(summary) => onUpdateUnit({ summary })}
              placeholder="Add a unit summary…"
              multiline
              className="text-xs text-zinc-600 dark:text-zinc-400 block leading-snug"
            />
            <div className="flex items-center gap-1.5 text-xs text-zinc-400">
              <span>Duration:</span>
              <InlineEdit
                value={String(unit.durationWeeks)}
                onSave={(v) => {
                  const n = parseInt(v, 10);
                  if (Number.isInteger(n) && n >= 1 && n <= 52) onUpdateUnit({ durationWeeks: n });
                }}
                className="text-xs text-zinc-600 dark:text-zinc-300 font-medium"
              />
              <span>weeks</span>
            </div>
          </div>

          {/* Lessons */}
          {unit.lessons.length > 0 && (
            <div>
              <div className="flex items-center gap-2 mb-2.5">
                <div className="text-[11px] font-semibold uppercase tracking-wider text-zinc-400 dark:text-zinc-500">
                  Lessons
                </div>
                <div className="flex-1 h-px bg-zinc-100 dark:bg-zinc-800" />
              </div>
              <SortableContext items={lessonIds} strategy={verticalListSortingStrategy}>
                <div className="space-y-1">
                  {unit.lessons.map((lesson, i) => (
                    <DraggableLessonRow
                      key={lesson.id}
                      lesson={lesson}
                      displayNumber={i + 1}
                      onUpdateTitle={(title) => onUpdateLesson(lesson.id, { title })}
                      onUpdateDuration={(durationMinutes) =>
                        onUpdateLesson(lesson.id, { durationMinutes })
                      }
                      onRetype={() => onRetypeLesson(lesson.id)}
                      onDelete={() => onDeleteLesson(lesson.id)}
                      onDetachMaterial={onDetachMaterial}
                      onUpdateMaterial={onUpdateMaterial}
                    />
                  ))}
                </div>
              </SortableContext>
            </div>
          )}

          {/* Assessments */}
          {unit.assessments.length > 0 && (
            <div>
              <div className="flex items-center gap-2 mb-2.5">
                <div className="text-[11px] font-semibold uppercase tracking-wider text-zinc-400 dark:text-zinc-500">
                  Assessments
                </div>
                <div className="flex-1 h-px bg-zinc-100 dark:bg-zinc-800" />
              </div>
              <SortableContext items={assessmentIds} strategy={verticalListSortingStrategy}>
                <div className="space-y-1">
                  {unit.assessments.map((assessment) => (
                    <DraggableAssessmentRow
                      key={assessment.id}
                      assessment={assessment}
                      onUpdateTitle={(title) =>
                        onUpdateAssessment(assessment.id, { title })
                      }
                      onUpdateType={(assessmentType) =>
                        onUpdateAssessment(assessment.id, { assessmentType })
                      }
                      onRetype={() => onRetypeAssessment(assessment.id)}
                      onDetachMaterial={onDetachMaterial}
                      onUpdateMaterial={onUpdateMaterial}
                    />
                  ))}
                </div>
              </SortableContext>
            </div>
          )}

          {unit.lessons.length === 0 && unit.assessments.length === 0 && (
            <div className="rounded-lg border-2 border-dashed border-zinc-200 dark:border-zinc-700 py-6 text-center">
              <p className="text-xs text-zinc-400">
                Drop lessons or materials here
              </p>
            </div>
          )}

          {/* Unit actions */}
          <div className="flex items-center justify-between pt-1">
            <button
              onClick={onAddLesson}
              className="text-[11px] font-medium text-zinc-500 hover:text-zinc-800 dark:text-zinc-400 dark:hover:text-zinc-200 transition-colors"
            >
              + Add lesson
            </button>
            {confirmingDelete ? (
              <span className="flex items-center gap-2 text-[11px]">
                <span className="text-zinc-500 dark:text-zinc-400">Delete unit?</span>
                <button
                  onClick={() => {
                    setConfirmingDelete(false);
                    onDeleteUnit();
                  }}
                  className="font-semibold text-white bg-red-600 hover:bg-red-700 rounded px-2 py-0.5 transition-colors"
                >
                  Delete
                </button>
                <button
                  onClick={() => setConfirmingDelete(false)}
                  className="font-medium text-zinc-500 hover:text-zinc-800 dark:text-zinc-400 dark:hover:text-zinc-200 transition-colors"
                >
                  Cancel
                </button>
              </span>
            ) : (
              <button
                onClick={() => setConfirmingDelete(true)}
                className="text-[11px] font-medium text-zinc-400 hover:text-red-600 dark:hover:text-red-400 transition-colors"
              >
                Delete unit
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
