"use client";

import { useParams } from "next/navigation";
import Link from "next/link";
import {
  DndContext,
  DragOverlay,
  closestCenter,
  PointerSensor,
  useSensor,
  useSensors,
  type DragStartEvent,
  type DragEndEvent,
  type DragOverEvent,
} from "@dnd-kit/core";
import { arrayMove } from "@dnd-kit/sortable";
import { useState, useCallback } from "react";
import { useCurriculumEditor } from "@/lib/use-curriculum-editor";
import UnitColumn from "@/components/curriculum-editor/UnitColumn";
import ContentPool from "@/components/curriculum-editor/ContentPool";
import SaveIndicator from "@/components/curriculum-editor/SaveIndicator";

export default function CurriculumEditorPage() {
  const { courseId } = useParams<{ courseId: string }>();
  const editor = useCurriculumEditor(courseId);
  const [activeId, setActiveId] = useState<string | null>(null);

  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: { distance: 5 },
    })
  );

  // ── Find which unit contains a lesson or assessment ───

  const findUnitForItem = useCallback(
    (itemId: string) => {
      for (const unit of editor.units) {
        if (unit.lessons.some((l) => l.id === itemId)) return unit;
        if (unit.assessments.some((a) => a.id === itemId)) return unit;
      }
      return null;
    },
    [editor.units]
  );

  // ── DnD handlers ───

  function handleDragStart(event: DragStartEvent) {
    setActiveId(event.active.id as string);
  }

  function handleDragEnd(event: DragEndEvent) {
    setActiveId(null);
    const { active, over } = event;
    if (!over) return;

    const activeData = active.data.current;
    const overId = over.id as string;

    // Pool material dropped on a unit
    if (activeData?.type === "pool-material") {
      const targetUnitId = over.data.current?.unitId;
      if (targetUnitId) {
        editor.attachMaterial(activeData.materialId, "unit", targetUnitId);
      }
      return;
    }

    // Lesson reorder or cross-unit move
    if (activeData?.type === "lesson") {
      const activeUnit = findUnitForItem(active.id as string);
      if (!activeUnit) return;

      if (overId.startsWith("unit-drop-")) {
        const targetUnitId = overId.replace("unit-drop-", "");
        if (targetUnitId !== activeUnit.id) {
          const targetUnit = editor.units.find((u) => u.id === targetUnitId);
          const newSortOrder = (targetUnit?.lessons.length ?? 0) + 1;
          editor.moveLesson(active.id as string, activeUnit.id, targetUnitId, newSortOrder);
        }
        return;
      }

      const overUnit = findUnitForItem(overId);
      if (overUnit && overUnit.id === activeUnit.id) {
        const oldIndex = activeUnit.lessons.findIndex((l) => l.id === active.id);
        const newIndex = activeUnit.lessons.findIndex((l) => l.id === overId);
        if (oldIndex !== -1 && newIndex !== -1 && oldIndex !== newIndex) {
          const newOrder = arrayMove(
            activeUnit.lessons.map((l) => l.id),
            oldIndex,
            newIndex
          );
          editor.reorderLessons(activeUnit.id, newOrder);
        }
      } else if (overUnit && overUnit.id !== activeUnit.id) {
        const overIndex = overUnit.lessons.findIndex((l) => l.id === overId);
        const newSortOrder = overIndex !== -1 ? overIndex + 1 : overUnit.lessons.length + 1;
        editor.moveLesson(active.id as string, activeUnit.id, overUnit.id, newSortOrder);
      }
      return;
    }

    // Assessment reorder or cross-unit move
    if (activeData?.type === "assessment") {
      const activeUnit = findUnitForItem(active.id as string);
      if (!activeUnit) return;

      if (overId.startsWith("unit-drop-")) {
        const targetUnitId = overId.replace("unit-drop-", "");
        if (targetUnitId !== activeUnit.id) {
          const targetUnit = editor.units.find((u) => u.id === targetUnitId);
          const newSortOrder = (targetUnit?.assessments.length ?? 0) + 1;
          editor.moveAssessment(active.id as string, activeUnit.id, targetUnitId, newSortOrder);
        }
        return;
      }

      const overUnit = findUnitForItem(overId);
      if (overUnit && overUnit.id === activeUnit.id) {
        // Same-unit reorder
      } else if (overUnit && overUnit.id !== activeUnit.id) {
        const overIndex = overUnit.assessments.findIndex((a) => a.id === overId);
        const newSortOrder = overIndex !== -1 ? overIndex + 1 : overUnit.assessments.length + 1;
        editor.moveAssessment(active.id as string, activeUnit.id, overUnit.id, newSortOrder);
      }
    }
  }

  // ── Loading state ───

  if (editor.loading) {
    return (
      <div className="min-h-screen bg-zinc-50 dark:bg-zinc-950 flex items-center justify-center">
        <span className="text-sm text-zinc-400 animate-pulse">
          Loading editor...
        </span>
      </div>
    );
  }

  if (!editor.course) {
    return (
      <div className="min-h-screen bg-zinc-50 dark:bg-zinc-950 flex items-center justify-center">
        <p className="text-sm text-zinc-400">Course not found.</p>
      </div>
    );
  }

  const totalLessons = editor.units.reduce((s, u) => s + u.lessons.length, 0);
  const totalAssessments = editor.units.reduce((s, u) => s + u.assessments.length, 0);

  return (
    <div className="min-h-screen bg-zinc-100/50 dark:bg-zinc-950">
      {/* ── Toolbar ─── */}
      <div className="sticky top-0 z-10 bg-white/95 dark:bg-zinc-900/95 backdrop-blur-sm border-b border-zinc-200 dark:border-zinc-800 px-6 py-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-4">
            <Link
              href="/curriculum"
              className="flex items-center gap-1.5 text-xs font-medium text-zinc-400 hover:text-zinc-700 dark:hover:text-zinc-300 transition-colors"
            >
              <svg width="14" height="14" viewBox="0 0 16 16" fill="currentColor">
                <path d="M11 2L5 8l6 6" stroke="currentColor" strokeWidth="2" fill="none" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
              Curriculum
            </Link>
            <div className="w-px h-4 bg-zinc-200 dark:bg-zinc-700" />
            <div>
              <h1 className="text-sm font-semibold text-zinc-900 dark:text-zinc-50">
                Grade {editor.course.grade} &mdash; {editor.course.title}
              </h1>
              <p className="text-[11px] text-zinc-400 mt-0.5">
                {editor.units.length} units &middot; {totalLessons} lessons &middot; {totalAssessments} assessments
              </p>
            </div>
          </div>
          <SaveIndicator status={editor.saveStatus} />
        </div>
      </div>

      {/* ── Two-panel layout ─── */}
      <DndContext
        sensors={sensors}
        collisionDetection={closestCenter}
        onDragStart={handleDragStart}
        onDragEnd={handleDragEnd}
      >
        <div className="flex h-[calc(100vh-61px)]">
          {/* Left panel: Unit tree */}
          <div className="flex-1 overflow-y-auto px-6 py-5 space-y-4">
            {editor.units.length > 0 ? (
              editor.units.map((unit) => (
                <UnitColumn
                  key={unit.id}
                  unit={unit}
                  onUpdateUnit={(fields) =>
                    editor.updateItem("unit", unit.id, fields)
                  }
                  onUpdateLesson={(lessonId, fields) =>
                    editor.updateItem("lesson", lessonId, fields)
                  }
                  onUpdateAssessment={(assessmentId, fields) =>
                    editor.updateItem("assessment", assessmentId, fields)
                  }
                  onRetypeLesson={(lessonId) =>
                    editor.retypeContent("lesson", lessonId, "assessment")
                  }
                  onRetypeAssessment={(assessmentId) =>
                    editor.retypeContent("assessment", assessmentId, "lesson")
                  }
                  onDetachMaterial={(attachmentId) =>
                    editor.detachMaterial(attachmentId)
                  }
                />
              ))
            ) : (
              <div className="text-center py-16">
                <p className="text-sm text-zinc-400">
                  No units found for this course.
                </p>
              </div>
            )}
          </div>

          {/* Right panel: Content pool */}
          <div className="w-[380px] shrink-0 border-l border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 shadow-[-4px_0_12px_rgba(0,0,0,0.03)]">
            <ContentPool materials={editor.pool} />
          </div>
        </div>

        {/* Drag overlay */}
        <DragOverlay>
          {activeId ? (
            <div className="rounded-lg border border-blue-300 bg-blue-50 dark:bg-blue-950 px-4 py-2.5 text-sm font-medium text-blue-700 dark:text-blue-300 shadow-xl shadow-blue-500/10">
              Moving item...
            </div>
          ) : null}
        </DragOverlay>
      </DndContext>
    </div>
  );
}
