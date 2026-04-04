// ── Curriculum Editor Types ───

// ── Entity types as displayed in the editor ───

export type EditorMaterialLink = {
  attachmentId: string;
  materialId: string;
  title: string;
  materialType: string;
  role: string;
  driveWebUrl: string | null;
};

export type EditorLesson = {
  id: string;
  title: string;
  sortOrder: number;
  durationMinutes: number | null;
  source: string;
  materialCount: number;
  materials: EditorMaterialLink[];
};

export type EditorAssessment = {
  id: string;
  title: string;
  assessmentType: string;
  sortOrder: number;
  source: string;
  materialCount: number;
  materials: EditorMaterialLink[];
};

export type EditorUnit = {
  id: string;
  title: string;
  quarter: string | null;
  sortOrder: number;
  durationWeeks: number;
  summary: string;
  lessons: EditorLesson[];
  assessments: EditorAssessment[];
};

export type PoolMaterial = {
  id: string;
  title: string;
  materialType: string;
  driveWebUrl: string | null;
  driveMimeType: string | null;
  // Where it's currently attached (if anywhere)
  attachment: {
    id: string;
    attachableType: string;
    attachableId: string;
    role: string;
  } | null;
};

// ── API request payloads ───

export type ReorderLessonsPayload = {
  unitId: string;
  lessonIds: string[];
};

export type MoveLessonPayload = {
  lessonId: string;
  fromUnitId: string;
  toUnitId: string;
  newSortOrder: number;
};

export type MoveAssessmentPayload = {
  assessmentId: string;
  fromUnitId: string;
  toUnitId: string;
  newSortOrder: number;
};

export type UpdateItemPayload = {
  entityType: "lesson" | "assessment" | "unit";
  entityId: string;
  fields: {
    title?: string;
    sortOrder?: number;
    assessmentType?: string;
    durationMinutes?: number;
    durationWeeks?: number;
    quarter?: string;
  };
};

export type RetypeContentPayload = {
  entityType: "lesson" | "assessment";
  entityId: string;
  newType: "lesson" | "assessment";
};

export type AttachMaterialPayload = {
  materialId: string;
  attachableType: "lesson" | "assessment" | "unit";
  attachableId: string;
  role?: string;
};

export type DetachMaterialPayload = {
  materialAttachmentId: string;
};

// ── Edit log action types ───

export type EditAction =
  | "reorder_lesson"
  | "move_lesson"
  | "move_assessment"
  | "retype_content"
  | "update_title"
  | "update_metadata"
  | "attach_material"
  | "detach_material"
  | "update_material_role"
  | "update_material_type";
