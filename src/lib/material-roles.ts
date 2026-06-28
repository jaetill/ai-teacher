// material_attachments.role is a free-text column (see src/db/schema/materials.ts).
// Roles are produced by the AI ("primary" | "supporting" | "teacher_reference"),
// but nothing in the schema constrains the value, so an unexpected/garbage role
// from the model would be persisted verbatim. Normalize against an allowlist
// before insert; anything outside it falls back to the safe default.

export const MATERIAL_ROLES = ["primary", "supporting", "teacher_reference"] as const;

export type MaterialRole = (typeof MATERIAL_ROLES)[number];

const DEFAULT_ROLE: MaterialRole = "supporting";

export function normalizeMaterialRole(role: unknown): MaterialRole {
  return typeof role === "string" && (MATERIAL_ROLES as readonly string[]).includes(role)
    ? (role as MaterialRole)
    : DEFAULT_ROLE;
}
