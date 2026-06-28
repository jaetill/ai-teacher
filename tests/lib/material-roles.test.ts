import { describe, it, expect } from "vitest";
import { normalizeMaterialRole, MATERIAL_ROLES } from "@/lib/material-roles";

describe("normalizeMaterialRole", () => {
  it("passes through each allowlisted role unchanged", () => {
    for (const role of MATERIAL_ROLES) {
      expect(normalizeMaterialRole(role)).toBe(role);
    }
  });

  it("falls back to 'supporting' for an AI-returned role outside the allowlist", () => {
    expect(normalizeMaterialRole("primary; DROP TABLE materials")).toBe(
      "supporting"
    );
    expect(normalizeMaterialRole("admin")).toBe("supporting");
    expect(normalizeMaterialRole("")).toBe("supporting");
  });

  it("falls back to 'supporting' for non-string values", () => {
    expect(normalizeMaterialRole(undefined)).toBe("supporting");
    expect(normalizeMaterialRole(null)).toBe("supporting");
    expect(normalizeMaterialRole(42)).toBe("supporting");
    expect(normalizeMaterialRole({ role: "primary" })).toBe("supporting");
  });
});
