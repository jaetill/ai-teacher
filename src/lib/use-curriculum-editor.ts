"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import type {
  EditorUnit,
  EditorLesson,
  PoolMaterial,
} from "@/types/curriculum-editor";

type SaveStatus = "idle" | "saving" | "saved" | "error";

// Shape returned by GET /api/curriculum/editor/pool — same fields as
// PoolMaterial except the API returns the full `attachments` array; the
// hook collapses it to a single `attachment` (the first one, or null).
type PoolMaterialApiRow = Omit<PoolMaterial, "attachment"> & {
  attachments?: NonNullable<PoolMaterial["attachment"]>[];
};

export function useCurriculumEditor(courseId: string) {
  const [units, setUnits] = useState<EditorUnit[]>([]);
  const [pool, setPool] = useState<PoolMaterial[]>([]);
  const [course, setCourse] = useState<{ id: string; title: string; grade: number } | null>(null);
  const [loading, setLoading] = useState(true);
  const [saveStatus, setSaveStatus] = useState<SaveStatus>("idle");
  // Pending status-reset timer. Cleared before each save so a stale timer from
  // an earlier save can't wipe a newer status (e.g. save A's "saved → idle"
  // timer firing 0.3s after save B set "error", hiding the failure).
  const statusTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // ── Load data ───

  const fetchData = useCallback(async () => {
    try {
      const [dataRes, poolRes] = await Promise.all([
        fetch(`/api/curriculum/editor/data?courseId=${courseId}`),
        fetch(`/api/curriculum/editor/pool?courseId=${courseId}`),
      ]);
      // A transient 401/500 used to parse the error JSON and set
      // course/units to undefined, crashing or blanking the editor.
      // Throw instead: initial load shows the not-found state; a failed
      // background refresh keeps the current data on screen.
      if (!dataRes.ok || !poolRes.ok) {
        throw new Error(
          `editor data load failed (${dataRes.status}/${poolRes.status})`
        );
      }
      const data = await dataRes.json();
      const poolData = await poolRes.json();
      setCourse(data.course ?? null);
      setUnits(data.units ?? []);
      setPool(
        (poolData.materials ?? []).map(
          (m: PoolMaterialApiRow): PoolMaterial => ({
            id: m.id,
            title: m.title,
            materialType: m.materialType,
            sourceUnit: m.sourceUnit ?? null,
            driveWebUrl: m.driveWebUrl,
            driveMimeType: m.driveMimeType,
            attachment: m.attachments?.[0] ?? null,
          })
        )
      );
    } catch (err) {
      console.error("Failed to load editor data", err);
    } finally {
      setLoading(false);
    }
  }, [courseId]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  // ── API helper ───

  async function apiCall(path: string, body: unknown) {
    setSaveStatus("saving");
    if (statusTimerRef.current) clearTimeout(statusTimerRef.current);
    try {
      const res = await fetch(`/api/curriculum/editor/${path}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error || "API error");
      }
      setSaveStatus("saved");
      if (statusTimerRef.current) clearTimeout(statusTimerRef.current);
      statusTimerRef.current = setTimeout(() => setSaveStatus("idle"), 1500);
      return res.json();
    } catch (err) {
      setSaveStatus("error");
      if (statusTimerRef.current) clearTimeout(statusTimerRef.current);
      statusTimerRef.current = setTimeout(() => setSaveStatus("idle"), 3000);
      throw err;
    }
  }

  // ── Reorder lessons within a unit (optimistic) ───

  async function reorderLessons(unitId: string, lessonIds: string[]) {
    // Optimistic update
    setUnits((prev) =>
      prev.map((u) => {
        if (u.id !== unitId) return u;
        const reordered = lessonIds
          .map((id, i) => {
            const lesson = u.lessons.find((l) => l.id === id);
            return lesson ? { ...lesson, sortOrder: i + 1 } : null;
          })
          .filter(Boolean) as EditorLesson[];
        return { ...u, lessons: reordered };
      })
    );

    try {
      await apiCall("reorder-lessons", { unitId, lessonIds });
    } catch {
      await fetchData(); // revert on failure
    }
  }

  // ── Move lesson between units (optimistic) ───

  async function moveLesson(
    lessonId: string,
    fromUnitId: string,
    toUnitId: string,
    newSortOrder: number
  ) {
    setUnits((prev) => {
      const updated = prev.map((u) => {
        if (u.id === fromUnitId) {
          return {
            ...u,
            lessons: u.lessons
              .filter((l) => l.id !== lessonId)
              .map((l, i) => ({ ...l, sortOrder: i + 1 })),
          };
        }
        if (u.id === toUnitId) {
          const fromUnit = prev.find((u2) => u2.id === fromUnitId);
          const lesson = fromUnit?.lessons.find((l) => l.id === lessonId);
          if (!lesson) return u;
          const newLessons = [...u.lessons];
          newLessons.splice(newSortOrder - 1, 0, { ...lesson, sortOrder: newSortOrder });
          return {
            ...u,
            lessons: newLessons.map((l, i) => ({ ...l, sortOrder: i + 1 })),
          };
        }
        return u;
      });
      return updated;
    });

    try {
      await apiCall("move-lesson", { lessonId, fromUnitId, toUnitId, newSortOrder });
    } catch {
      await fetchData();
    }
  }

  // ── Move assessment between units ───

  async function moveAssessment(
    assessmentId: string,
    fromUnitId: string,
    toUnitId: string,
    newSortOrder: number
  ) {
    setUnits((prev) =>
      prev.map((u) => {
        // Same-unit reorder: remove + reinsert in one pass. (The two-branch
        // logic below never reinserted when fromUnitId === toUnitId, so the
        // assessment vanished from the optimistic state.)
        if (fromUnitId === toUnitId) {
          if (u.id !== fromUnitId) return u;
          const current = u.assessments.find((a) => a.id === assessmentId);
          if (!current) return u;
          const reordered = u.assessments.filter((a) => a.id !== assessmentId);
          reordered.splice(newSortOrder - 1, 0, current);
          return {
            ...u,
            assessments: reordered.map((a, i) => ({ ...a, sortOrder: i + 1 })),
          };
        }
        if (u.id === fromUnitId) {
          return {
            ...u,
            assessments: u.assessments
              .filter((a) => a.id !== assessmentId)
              .map((a, i) => ({ ...a, sortOrder: i + 1 })),
          };
        }
        if (u.id === toUnitId) {
          const fromUnit = prev.find((u2) => u2.id === fromUnitId);
          const assessment = fromUnit?.assessments.find((a) => a.id === assessmentId);
          if (!assessment) return u;
          const newAssessments = [...u.assessments];
          newAssessments.splice(newSortOrder - 1, 0, { ...assessment, sortOrder: newSortOrder });
          return {
            ...u,
            assessments: newAssessments.map((a, i) => ({ ...a, sortOrder: i + 1 })),
          };
        }
        return u;
      })
    );

    try {
      await apiCall("move-assessment", { assessmentId, fromUnitId, toUnitId, newSortOrder });
    } catch {
      await fetchData();
    }
  }

  // ── Update item field (optimistic) ───

  async function updateItem(
    entityType: "lesson" | "assessment" | "unit",
    entityId: string,
    fields: Record<string, unknown>
  ) {
    // Optimistic update
    setUnits((prev) =>
      prev.map((u) => {
        if (entityType === "unit" && u.id === entityId) {
          return { ...u, ...fields };
        }
        if (entityType === "lesson") {
          return {
            ...u,
            lessons: u.lessons.map((l) =>
              l.id === entityId ? { ...l, ...fields } : l
            ),
          };
        }
        if (entityType === "assessment") {
          return {
            ...u,
            assessments: u.assessments.map((a) =>
              a.id === entityId ? { ...a, ...fields } : a
            ),
          };
        }
        return u;
      })
    );

    try {
      await apiCall("update-item", { entityType, entityId, fields });
    } catch {
      await fetchData();
    }
  }

  // ── Create / delete units and lessons (structural — full reload after) ───

  async function createUnit() {
    try {
      await apiCall("create-unit", { courseId });
      await fetchData();
    } catch {
      await fetchData();
    }
  }

  async function deleteUnit(unitId: string) {
    // Optimistic remove so the column disappears immediately.
    setUnits((prev) => prev.filter((u) => u.id !== unitId));
    try {
      await apiCall("delete-unit", { unitId });
      await fetchData();
    } catch {
      await fetchData();
    }
  }

  async function createLesson(unitId: string) {
    try {
      await apiCall("create-lesson", { unitId });
      await fetchData();
    } catch {
      await fetchData();
    }
  }

  async function deleteLesson(lessonId: string) {
    setUnits((prev) =>
      prev.map((u) => ({ ...u, lessons: u.lessons.filter((l) => l.id !== lessonId) })),
    );
    try {
      await apiCall("delete-lesson", { lessonId });
      await fetchData();
    } catch {
      await fetchData();
    }
  }

  // ── Retype content (lesson ↔ assessment) ───

  async function retypeContent(
    entityType: "lesson" | "assessment",
    entityId: string,
    newType: "lesson" | "assessment"
  ) {
    try {
      await apiCall("retype-content", { entityType, entityId, newType });
      await fetchData(); // full reload — entity IDs change
    } catch {
      await fetchData();
    }
  }

  // ── Attach material ───

  async function attachMaterial(
    materialId: string,
    attachableType: "lesson" | "assessment" | "unit",
    attachableId: string
  ) {
    try {
      await apiCall("attach-material", { materialId, attachableType, attachableId });
      await fetchData();
    } catch {
      await fetchData();
    }
  }

  // ── Move an attached material from one lesson/assessment/unit to another ───
  // Attach to the new target first, then detach the old link, so a mid-flight
  // failure never leaves the material homeless. A full reload follows.

  async function moveAttachment(
    materialId: string,
    fromAttachmentId: string,
    toType: "lesson" | "assessment" | "unit",
    toId: string
  ) {
    try {
      await apiCall("attach-material", {
        materialId,
        attachableType: toType,
        attachableId: toId,
      });
      await apiCall("detach-material", { materialAttachmentId: fromAttachmentId });
      await fetchData();
    } catch {
      await fetchData();
    }
  }

  // ── Update material attachment role or material type ───

  async function updateMaterial(
    attachmentId: string,
    fields: { role?: string; materialType?: string }
  ) {
    // Optimistic update
    setUnits((prev) =>
      prev.map((u) => ({
        ...u,
        lessons: u.lessons.map((l) => ({
          ...l,
          materials: l.materials.map((m) =>
            m.attachmentId === attachmentId
              ? { ...m, ...(fields.role && { role: fields.role }), ...(fields.materialType && { materialType: fields.materialType }) }
              : m
          ),
        })),
        assessments: u.assessments.map((a) => ({
          ...a,
          materials: a.materials.map((m) =>
            m.attachmentId === attachmentId
              ? { ...m, ...(fields.role && { role: fields.role }), ...(fields.materialType && { materialType: fields.materialType }) }
              : m
          ),
        })),
      }))
    );

    try {
      await apiCall("update-material", { attachmentId, ...fields });
    } catch {
      await fetchData();
    }
  }

  // ── Detach material ───

  async function detachMaterial(materialAttachmentId: string) {
    try {
      await apiCall("detach-material", { materialAttachmentId });
      await fetchData();
    } catch {
      await fetchData();
    }
  }

  // ── Rename the course (title) ───

  async function renameCourse(title: string): Promise<boolean> {
    const next = title.trim();
    if (!next) return false;
    setSaveStatus("saving");
    try {
      const res = await fetch(`/api/courses/${courseId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title: next }),
      });
      if (!res.ok) throw new Error(`API error ${res.status}`);
      setCourse((prev) => (prev ? { ...prev, title: next } : prev));
      setSaveStatus("saved");
      setTimeout(() => setSaveStatus("idle"), 1500);
      return true;
    } catch (err) {
      console.error("Failed to rename course", err);
      setSaveStatus("error");
      setTimeout(() => setSaveStatus("idle"), 3000);
      return false;
    }
  }

  // ── Delete the whole course ───

  async function deleteCourse(): Promise<boolean> {
    try {
      const res = await fetch(`/api/courses/${courseId}`, { method: "DELETE" });
      return res.ok;
    } catch (err) {
      console.error("Failed to delete course", err);
      return false;
    }
  }

  return {
    course,
    units,
    pool,
    loading,
    saveStatus,
    reorderLessons,
    moveLesson,
    moveAssessment,
    updateItem,
    retypeContent,
    attachMaterial,
    moveAttachment,
    detachMaterial,
    updateMaterial,
    createUnit,
    deleteUnit,
    createLesson,
    deleteLesson,
    renameCourse,
    deleteCourse,
    refresh: fetchData,
  };
}
