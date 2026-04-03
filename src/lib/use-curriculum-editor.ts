"use client";

import { useState, useEffect, useCallback } from "react";
import type {
  EditorUnit,
  EditorLesson,
  EditorAssessment,
  PoolMaterial,
} from "@/types/curriculum-editor";

type SaveStatus = "idle" | "saving" | "saved" | "error";

export function useCurriculumEditor(courseId: string) {
  const [units, setUnits] = useState<EditorUnit[]>([]);
  const [pool, setPool] = useState<PoolMaterial[]>([]);
  const [course, setCourse] = useState<{ id: string; title: string; grade: number } | null>(null);
  const [loading, setLoading] = useState(true);
  const [saveStatus, setSaveStatus] = useState<SaveStatus>("idle");

  // ── Load data ───

  const fetchData = useCallback(async () => {
    try {
      const [dataRes, poolRes] = await Promise.all([
        fetch(`/api/curriculum/editor/data?courseId=${courseId}`),
        fetch(`/api/curriculum/editor/pool?courseId=${courseId}`),
      ]);
      const data = await dataRes.json();
      const poolData = await poolRes.json();
      setCourse(data.course);
      setUnits(data.units);
      setPool(
        (poolData.materials ?? []).map((m: any) => ({
          ...m,
          attachment: m.attachments?.[0] ?? null,
        }))
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
    try {
      const res = await fetch(`/api/curriculum/editor/${path}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || "API error");
      }
      setSaveStatus("saved");
      setTimeout(() => setSaveStatus("idle"), 1500);
      return res.json();
    } catch (err) {
      setSaveStatus("error");
      setTimeout(() => setSaveStatus("idle"), 3000);
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
    detachMaterial,
    updateMaterial,
    refresh: fetchData,
  };
}
