import { describe, it, expect, vi, beforeEach } from "vitest";

const { mockDbSelect, mockFetchDriveText, mockGetAccessToken } = vi.hoisted(() => ({
  mockDbSelect: vi.fn(),
  mockFetchDriveText: vi.fn(),
  mockGetAccessToken: vi.fn(),
}));

vi.mock("@/db", () => ({ db: { select: mockDbSelect } }));
vi.mock("@/db/schema", () => ({ driveFolders: {}, materials: {} }));
vi.mock("drizzle-orm", () => ({
  eq: vi.fn(),
  and: vi.fn(),
  or: vi.fn(),
  isNull: vi.fn(),
  inArray: vi.fn(),
}));
vi.mock("@/lib/material-scope", () => ({ ownedMaterials: vi.fn() }));
vi.mock("@/lib/auth-helpers", () => ({ getAccessToken: mockGetAccessToken }));
vi.mock("@/lib/drive-text", () => ({
  fetchDriveText: mockFetchDriveText,
  // Real-ish: only Docs/docx/text are extractable. PDFs are not.
  isExtractable: (mime: string | null) =>
    mime === "application/vnd.google-apps.document" || mime === "text/plain",
}));

import {
  loadYearPlanReference,
  yearPlanFolderKey,
  YEAR_PLAN_CHAR_BUDGET,
  YEAR_PLAN_MAX_FILES,
} from "@/lib/year-plan-reference";

function makeChain(value: unknown) {
  const p = Promise.resolve(value);
  const chain: Record<string, unknown> = {};
  const self = () => chain;
  chain.from = self;
  chain.where = self;
  chain.limit = self;
  chain.then = (r: (v: unknown) => unknown, j?: (e: unknown) => unknown) => p.then(r, j);
  chain.catch = (j: (e: unknown) => unknown) => p.catch(j);
  chain.finally = (fn: () => void) => p.finally(fn);
  return chain;
}

const DOC = "application/vnd.google-apps.document";
const REQ = new Request("http://localhost/api/import/build-curriculum", { method: "POST" });
const EMAIL = "teacher@school.edu";

/** Prime: folders result, then materials result. */
function primeDb(folders: unknown[], materials: unknown[]) {
  mockDbSelect.mockReset();
  mockDbSelect.mockReturnValueOnce(makeChain(folders)).mockReturnValueOnce(makeChain(materials));
}

describe("yearPlanFolderKey", () => {
  it("is grade-scoped and has no quarter or category segment", () => {
    expect(yearPlanFolderKey(6)).toBe("grade_6_YearPlan");
  });
});

describe("loadYearPlanReference", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGetAccessToken.mockResolvedValue("token");
  });

  it("returns the text of the year-plan files, labelled by title", async () => {
    primeDb(
      [{ driveId: "yp-folder" }],
      [{ title: "6th Grade Plan", driveFileId: "f1", driveMimeType: DOC }],
    );
    mockFetchDriveText.mockResolvedValue("Q1: The Giver. Q2: Poetry.");

    const out = await loadYearPlanReference(REQ, EMAIL, 6);

    expect(out).toContain("--- 6th Grade Plan ---");
    expect(out).toContain("Q1: The Giver. Q2: Poetry.");
    expect(mockFetchDriveText).toHaveBeenCalledWith("token", "f1", DOC);
  });

  it("returns empty when the grade has no Year Plan folder", async () => {
    primeDb([], []);

    expect(await loadYearPlanReference(REQ, EMAIL, 6)).toBe("");
    // No point spending a Drive round-trip when there's nothing to read.
    expect(mockFetchDriveText).not.toHaveBeenCalled();
  });

  it("returns empty when the folder holds only unextractable files", async () => {
    primeDb(
      [{ driveId: "yp-folder" }],
      [{ title: "Scanned Plan.pdf", driveFileId: "f1", driveMimeType: "application/pdf" }],
    );

    expect(await loadYearPlanReference(REQ, EMAIL, 6)).toBe("");
    expect(mockGetAccessToken).not.toHaveBeenCalled();
  });

  it("skips a file Drive refuses and keeps the ones it can read", async () => {
    primeDb(
      [{ driveId: "yp-folder" }],
      [
        { title: "Broken", driveFileId: "f1", driveMimeType: DOC },
        { title: "Good", driveFileId: "f2", driveMimeType: DOC },
      ],
    );
    mockFetchDriveText
      .mockRejectedValueOnce(new Error("export size limit exceeded"))
      .mockResolvedValueOnce("the readable plan");

    const out = await loadYearPlanReference(REQ, EMAIL, 6);

    expect(out).toContain("the readable plan");
    expect(out).not.toContain("Broken");
  });

  it("never throws — a DB failure degrades to no reference", async () => {
    mockDbSelect.mockReset();
    mockDbSelect.mockImplementation(() => {
      throw new Error("connection lost");
    });

    await expect(loadYearPlanReference(REQ, EMAIL, 6)).resolves.toBe("");
  });

  it("returns empty when the access token is gone", async () => {
    primeDb([{ driveId: "yp-folder" }], [{ title: "Plan", driveFileId: "f1", driveMimeType: DOC }]);
    mockGetAccessToken.mockResolvedValue(null);

    expect(await loadYearPlanReference(REQ, EMAIL, 6)).toBe("");
  });

  it("caps how many files it reads", async () => {
    primeDb(
      [{ driveId: "yp-folder" }],
      Array.from({ length: YEAR_PLAN_MAX_FILES + 3 }, (_, i) => ({
        title: `Plan ${i}`,
        driveFileId: `f${i}`,
        driveMimeType: DOC,
      })),
    );
    mockFetchDriveText.mockResolvedValue("text");

    await loadYearPlanReference(REQ, EMAIL, 6);

    expect(mockFetchDriveText).toHaveBeenCalledTimes(YEAR_PLAN_MAX_FILES);
  });

  it("truncates a year plan that would blow the prompt budget", async () => {
    primeDb([{ driveId: "yp-folder" }], [{ title: "Plan", driveFileId: "f1", driveMimeType: DOC }]);
    mockFetchDriveText.mockResolvedValue("x".repeat(YEAR_PLAN_CHAR_BUDGET * 2));

    const out = await loadYearPlanReference(REQ, EMAIL, 6);

    expect(out).toContain("[year plan truncated]");
    expect(out.length).toBeLessThan(YEAR_PLAN_CHAR_BUDGET + 50);
  });
});
