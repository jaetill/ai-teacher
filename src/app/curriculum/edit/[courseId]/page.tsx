"use client";

import { useParams, useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import {
  DndContext,
  DragOverlay,
  closestCenter,
  pointerWithin,
  rectIntersection,
  PointerSensor,
  useSensor,
  useSensors,
  type DragStartEvent,
  type DragEndEvent,
  type CollisionDetection,
} from "@dnd-kit/core";
import { arrayMove } from "@dnd-kit/sortable";
import { useState, useCallback, useRef } from "react";
import { useCurriculumEditor } from "@/lib/use-curriculum-editor";
import UnitColumn from "@/components/curriculum-editor/UnitColumn";
import ContentPool from "@/components/curriculum-editor/ContentPool";
import SaveIndicator from "@/components/curriculum-editor/SaveIndicator";

export default function CurriculumEditorPage() {
  const { courseId } = useParams<{ courseId: string }>();
  // Scoped editing (#633 flow): ?quarter=Q2 or ?unit=<id> narrows the editor
  // to one slice of the year. Same editor, filtered view — a chip offers the
  // way back out to the full curriculum.
  const searchParams = useSearchParams();
  const scopeQuarter = searchParams.get("quarter");
  const scopeUnit = searchParams.get("unit");
  const router = useRouter();
  const editor = useCurriculumEditor(courseId);

  const visibleUnits = editor.units.filter((u) => {
    if (scopeUnit) return u.id === scopeUnit;
    if (scopeQuarter) return u.quarter === scopeQuarter;
    return true;
  });
  const [activeId, setActiveId] = useState<string | null>(null);
  // What to show in the drag overlay — the item's own name, not "Moving item".
  const [activeLabel, setActiveLabel] = useState<string | null>(null);

  // Title editing + delete confirmation (course-level, in the toolbar).
  const [editingTitle, setEditingTitle] = useState(false);
  const [titleDraft, setTitleDraft] = useState("");
  const [confirmingDelete, setConfirmingDelete] = useState(false);
  const [deleting, setDeleting] = useState(false);

  function beginTitleEdit() {
    setTitleDraft(editor.course?.title ?? "");
    setEditingTitle(true);
  }
  async function commitTitleEdit() {
    if (titleDraft.trim() && titleDraft.trim() !== editor.course?.title) {
      await editor.renameCourse(titleDraft);
    }
    setEditingTitle(false);
  }
  async function handleDelete() {
    setDeleting(true);
    const ok = await editor.deleteCourse();
    if (ok) {
      router.push("/curriculum");
    } else {
      setDeleting(false);
      setConfirmingDelete(false);
    }
  }

  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: { distance: 5 },
    })
  );

  // ── Custom collision detection ───
  // When dragging a pool material, use pointerWithin so it detects
  // unit drop zones and lesson/assessment targets in the left panel.
  // For lesson/assessment reordering, use closestCenter (default sortable behavior).
  const activeDataRef = useRef<Record<string, unknown> | null>(null);

  const collisionDetection: CollisionDetection = useCallback((args) => {
    const activeType = activeDataRef.current?.type;

    if (activeType === "pool-material" || activeType === "attached-material") {
      // pointerWithin works better for cross-panel — detects what's under the cursor
      const pointerCollisions = pointerWithin(args);
      if (pointerCollisions.length > 0) return pointerCollisions;
      // Fallback to rect intersection for edge cases
      return rectIntersection(args);
    }

    // For lessons/assessments, closestCenter gives good sortable UX
    return closestCenter(args);
  }, []);

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

  // ── Resolve where a material was dropped → { type, id } or null ───
  // Shared by the pool-material and attached-material drop paths so both
  // recognise the same drop zones (unit / lesson / assessment).

  const resolveDropTarget = useCallback(
    (
      overData: Record<string, unknown> | undefined,
      overId: string
    ): { type: "unit" | "lesson" | "assessment"; id: string } | null => {
      if (overData?.type === "unit-drop" && overData?.unitId) {
        return { type: "unit", id: overData.unitId as string };
      }
      if (overData?.lessonId) return { type: "lesson", id: overData.lessonId as string };
      if (overData?.assessmentId) return { type: "assessment", id: overData.assessmentId as string };
      if (overData?.type === "lesson") return { type: "lesson", id: overId };
      if (overData?.type === "assessment") return { type: "assessment", id: overId };
      const targetUnit = findUnitForItem(overId);
      if (targetUnit) return { type: "unit", id: targetUnit.id };
      return null;
    },
    [findUnitForItem]
  );

  // ── DnD handlers ───

  function handleDragStart(event: DragStartEvent) {
    setActiveId(event.active.id as string);
    setActiveLabel((event.active.data.current?.label as string) ?? null);
    activeDataRef.current = event.active.data.current ?? null;
  }

  function handleDragEnd(event: DragEndEvent) {
    setActiveId(null);
    setActiveLabel(null);
    activeDataRef.current = null;
    const { active, over } = event;
    if (!over) return;

    const activeData = active.data.current;
    const overId = over.id as string;

    // Pool material dropped on a unit, lesson, or assessment
    if (activeData?.type === "pool-material") {
      const target = resolveDropTarget(over.data.current, overId);
      if (target) editor.attachMaterial(activeData.materialId, target.type, target.id);
      return;
    }

    // A material already attached to a lesson/assessment, dragged to another one
    // (no unlink-to-pool round-trip). Re-home it: attach to target, detach source.
    if (activeData?.type === "attached-material") {
      const target = resolveDropTarget(over.data.current, overId);
      if (!target) return;
      // Dropped back on its own source → nothing to do.
      if (target.type === activeData.fromType && target.id === activeData.fromId) return;
      editor.moveAttachment(
        activeData.materialId,
        activeData.attachmentId,
        target.type,
        target.id
      );
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
        // Same-unit reorder. This was a silent no-op stub: dnd-kit animated
        // the drop, then the list snapped back with nothing persisted.
        const oldIndex = activeUnit.assessments.findIndex((a) => a.id === active.id);
        const newIndex = activeUnit.assessments.findIndex((a) => a.id === overId);
        if (oldIndex !== -1 && newIndex !== -1 && oldIndex !== newIndex) {
          editor.moveAssessment(
            active.id as string,
            activeUnit.id,
            activeUnit.id,
            newIndex + 1
          );
        }
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

  // Exit edit mode back to WHERE YOU CAME FROM (Jason 2026-07-31): a
  // unit-scoped edit returns to that unit's view, a quarter-scoped edit to
  // that quarter's view, a full edit to the year view — no forced detour
  // through the main curriculum page.
  const exitHref = scopeUnit
    ? `/curriculum/${scopeUnit}`
    : scopeQuarter
      ? `/curriculum/quarter/${courseId}/${scopeQuarter}`
      : "/curriculum";
  const exitLabel = scopeUnit
    ? "Done — unit view"
    : scopeQuarter
      ? `Done — ${scopeQuarter} view`
      : "Done — year view";

  return (
    <div className="min-h-screen bg-zinc-100/50 dark:bg-zinc-950">
      {/* ── Toolbar ─── */}
      <div className="sticky top-0 z-10 bg-white/95 dark:bg-zinc-900/95 backdrop-blur-sm border-b border-zinc-200 dark:border-zinc-800 px-6 py-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-4">
            <Link
              href={exitHref}
              className="flex items-center gap-1.5 text-xs font-medium text-emerald-700 dark:text-emerald-400 hover:text-emerald-800 dark:hover:text-emerald-300 transition-colors"
            >
              <svg width="14" height="14" viewBox="0 0 16 16" fill="currentColor">
                <path d="M11 2L5 8l6 6" stroke="currentColor" strokeWidth="2" fill="none" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
              {exitLabel}
            </Link>
            <div className="w-px h-4 bg-zinc-200 dark:bg-zinc-700" />
            <div>
              {editingTitle ? (
                <div className="flex items-center gap-1.5">
                  <span className="text-sm font-semibold text-zinc-400 shrink-0">
                    Grade {editor.course.grade} &mdash;
                  </span>
                  <input
                    type="text"
                    value={titleDraft}
                    autoFocus
                    onChange={(e) => setTitleDraft(e.target.value)}
                    onBlur={commitTitleEdit}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") commitTitleEdit();
                      if (e.key === "Escape") setEditingTitle(false);
                    }}
                    className="h-7 w-64 rounded-md border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-800 px-2 text-sm font-semibold text-zinc-900 dark:text-zinc-50 focus:outline-none focus:ring-2 focus:ring-zinc-900 dark:focus:ring-zinc-100"
                  />
                </div>
              ) : (
                <button
                  onClick={beginTitleEdit}
                  title="Rename curriculum"
                  className="flex items-center gap-1.5 text-sm font-semibold text-zinc-900 dark:text-zinc-50 hover:text-zinc-600 dark:hover:text-zinc-300 transition-colors"
                >
                  <span>Grade {editor.course.grade} &mdash; {editor.course.title}</span>
                  <svg width="12" height="12" viewBox="0 0 16 16" fill="currentColor" className="text-zinc-400 shrink-0">
                    <path d="M12.146.854a.5.5 0 01.708 0l2.292 2.292a.5.5 0 010 .708L5.854 13.146a.5.5 0 01-.233.131l-4 1a.5.5 0 01-.606-.606l1-4a.5.5 0 01.131-.232L12.146.854z" />
                  </svg>
                </button>
              )}
              <p className="text-[11px] text-zinc-400 mt-0.5 flex items-center gap-2">
                <span>
                  {editor.units.length} units &middot; {totalLessons} lessons &middot; {totalAssessments} assessments
                </span>
                {(scopeQuarter || scopeUnit) && (
                  <span className="inline-flex items-center gap-1.5 text-[10px] font-medium text-blue-600 dark:text-blue-400 bg-blue-50 dark:bg-blue-950/30 rounded-full px-2 py-0.5">
                    showing{" "}
                    {scopeQuarter ??
                      editor.units.find((u) => u.id === scopeUnit)?.title ??
                      "one unit"}{" "}
                    only
                    <Link
                      href={`/curriculum/edit/${courseId}`}
                      className="underline hover:no-underline"
                    >
                      show all
                    </Link>
                  </span>
                )}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-3">
            <SaveIndicator status={editor.saveStatus} />
            {confirmingDelete ? (
              <div className="flex items-center gap-2">
                <span className="text-xs text-zinc-500 dark:text-zinc-400">Delete this whole curriculum?</span>
                <button
                  onClick={handleDelete}
                  disabled={deleting}
                  className="text-xs font-medium text-white bg-red-600 hover:bg-red-700 disabled:opacity-50 rounded-md px-2.5 py-1 transition-colors"
                >
                  {deleting ? "Deleting…" : "Delete"}
                </button>
                <button
                  onClick={() => setConfirmingDelete(false)}
                  disabled={deleting}
                  className="text-xs font-medium text-zinc-500 hover:text-zinc-800 dark:text-zinc-400 dark:hover:text-zinc-200 transition-colors"
                >
                  Cancel
                </button>
              </div>
            ) : (
              <button
                onClick={() => setConfirmingDelete(true)}
                title="Delete curriculum"
                className="flex items-center gap-1.5 text-xs font-medium text-zinc-400 hover:text-red-600 dark:hover:text-red-400 transition-colors"
              >
                <svg width="13" height="13" viewBox="0 0 16 16" fill="currentColor">
                  <path d="M5.5 5.5A.5.5 0 016 6v6a.5.5 0 01-1 0V6a.5.5 0 01.5-.5zm2.5 0a.5.5 0 01.5.5v6a.5.5 0 01-1 0V6a.5.5 0 01.5-.5zm3 .5a.5.5 0 00-1 0v6a.5.5 0 001 0V6z" />
                  <path d="M14.5 3a1 1 0 01-1 1H13v9a2 2 0 01-2 2H5a2 2 0 01-2-2V4h-.5a1 1 0 01-1-1V2a1 1 0 011-1H6a1 1 0 011-1h2a1 1 0 011 1h3.5a1 1 0 011 1v1zM4.118 4L4 4.059V13a1 1 0 001 1h6a1 1 0 001-1V4.059L11.882 4H4.118zM2.5 3h11V2h-11v1z" />
                </svg>
                Delete
              </button>
            )}
          </div>
        </div>
      </div>

      {/* ── Two-panel layout ─── */}
      <DndContext
        sensors={sensors}
        collisionDetection={collisionDetection}
        onDragStart={handleDragStart}
        onDragEnd={handleDragEnd}
      >
        <div className="flex h-[calc(100vh-61px)]">
          {/* Left panel: Unit tree */}
          <div className="flex-1 overflow-y-auto px-6 py-5 space-y-4">
            {visibleUnits.length > 0 ? (
              visibleUnits.map((unit) => (
                <UnitColumn
                  key={unit.id}
                  unit={unit}
                  onUpdateUnit={(fields) =>
                    "quarter" in fields
                      ? editor.setUnitQuarter(
                          unit.id,
                          fields.quarter as string | null
                        )
                      : editor.updateItem("unit", unit.id, fields)
                  }
                  onUpdateLesson={(lessonId, fields) =>
                    editor.updateItem("lesson", lessonId, fields)
                  }
                  onUpdateAssessment={(assessmentId, fields) =>
                    editor.updateItem("assessment", assessmentId, fields)
                  }
                  onRetypeAssessment={(assessmentId) =>
                    editor.retypeContent("assessment", assessmentId, "lesson")
                  }
                  onDetachMaterial={(attachmentId) =>
                    editor.detachMaterial(attachmentId)
                  }
                  onUpdateMaterial={(attachmentId, fields) =>
                    editor.updateMaterial(attachmentId, fields)
                  }
                  onAddLesson={() => editor.createLesson(unit.id)}
                  onDeleteUnit={() => editor.deleteUnit(unit.id)}
                  onDeleteLesson={(lessonId) => editor.deleteLesson(lessonId)}
                />
              ))
            ) : (
              <div className="text-center py-16">
                <p className="text-sm text-zinc-400">
                  {scopeQuarter || scopeUnit
                    ? "Nothing in this view."
                    : "No units yet. Add one to start building this curriculum."}
                </p>
              </div>
            )}

            {/* Add a unit */}
            {!scopeUnit && (
              <button
                onClick={() => editor.createUnit(scopeQuarter)}
                className="w-full rounded-xl border-2 border-dashed border-zinc-200 dark:border-zinc-700 py-3 text-sm font-medium text-zinc-400 hover:text-zinc-700 dark:hover:text-zinc-200 hover:border-zinc-300 dark:hover:border-zinc-600 transition-colors"
              >
                + Add unit{scopeQuarter ? ` to ${scopeQuarter}` : ""}
              </button>
            )}
          </div>

          {/* Right panel: Content pool */}
          <div className="w-[380px] shrink-0 border-l border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 shadow-[-4px_0_12px_rgba(0,0,0,0.03)]">
            <ContentPool materials={editor.pool} onDetachMaterial={editor.detachMaterial} />
          </div>
        </div>

        {/* Drag overlay */}
        <DragOverlay>
          {activeId ? (
            <div className="flex items-center gap-2 rounded-lg border border-blue-300 bg-blue-50 dark:bg-blue-950 px-4 py-2.5 text-sm font-medium text-blue-700 dark:text-blue-300 shadow-xl shadow-blue-500/10 max-w-xs">
              <svg width="12" height="12" viewBox="0 0 14 14" fill="currentColor" className="shrink-0 opacity-60">
                <rect x="2" y="1" width="3.5" height="1.5" rx="0.5" />
                <rect x="8.5" y="1" width="3.5" height="1.5" rx="0.5" />
                <rect x="2" y="4.5" width="3.5" height="1.5" rx="0.5" />
                <rect x="8.5" y="4.5" width="3.5" height="1.5" rx="0.5" />
                <rect x="2" y="8" width="3.5" height="1.5" rx="0.5" />
                <rect x="8.5" y="8" width="3.5" height="1.5" rx="0.5" />
              </svg>
              <span className="truncate">{activeLabel ?? "Moving item…"}</span>
            </div>
          ) : null}
        </DragOverlay>
      </DndContext>
    </div>
  );
}
