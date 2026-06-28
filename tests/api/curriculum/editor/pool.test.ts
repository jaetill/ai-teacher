import { describe, it, expect, vi, beforeEach } from "vitest";

// ── Hoisted mocks ─────────────────────────────────────────────────────────────
const { mockDbSelect, mockInArray } = vi.hoisted(() => ({
  mockDbSelect: vi.fn(),
  mockInArray: vi.fn((col, vals) => ({ col, vals })),
}));

vi.mock("next-auth", () => ({ getServerSession: vi.fn() }));
vi.mock("@/lib/auth", () => ({ authOptions: {} }));
vi.mock("@/db", () => ({ db: { select: mockDbSelect } }));
vi.mock("@/db/schema", () => ({
  materials: {},
  materialAttachments: {},
  units: {},
  driveFolders: { folderKey: "folderKey", driveId: "driveId" },
  courses: { grade: "grade" },
}));
vi.mock("drizzle-orm", () => ({
  eq: vi.fn(),
  inArray: mockInArray,
  sql: vi.fn(),
  and: vi.fn(),
  or: vi.fn(),
  isNull: vi.fn(),
}));

import { getServerSession } from "next-auth";
import { GET } from "../../../../src/app/api/curriculum/editor/pool/route";

const mockSession = vi.mocked(getServerSession);

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

function makeRequest(courseId?: string) {
  const url = courseId
    ? `http://localhost/api/curriculum/editor/pool?courseId=${courseId}`
    : "http://localhost/api/curriculum/editor/pool";
  return new Request(url);
}

const COURSE_ID = "550e8400-e29b-41d4-a716-446655440000";
const SESSION = { user: { email: "teacher@example.com" }, expires: "" };

describe("GET /api/curriculum/editor/pool", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns 401 when there is no session", async () => {
    mockSession.mockResolvedValueOnce(null);

    const res = await GET(makeRequest(COURSE_ID));

    expect(res.status).toBe(401);
    const body = await res.json();
    expect(body.error).toBe("Not authenticated");
  });

  it("returns 401 when session has no email", async () => {
    mockSession.mockResolvedValueOnce({ user: {}, expires: "" });

    const res = await GET(makeRequest(COURSE_ID));

    expect(res.status).toBe(401);
    const body = await res.json();
    expect(body.error).toBe("Not authenticated");
  });

  it("returns 400 when courseId is missing", async () => {
    mockSession.mockResolvedValueOnce(SESSION);

    const res = await GET(makeRequest());

    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toBe("courseId required");
  });

  it("returns 403 when session user does not own the course (IDOR guard)", async () => {
    mockSession.mockResolvedValueOnce(SESSION);
    // assertCourseOwnership → empty = not owned by this user
    mockDbSelect.mockReturnValueOnce(makeChain([]));

    const res = await GET(makeRequest(COURSE_ID));

    expect(res.status).toBe(403);
    const body = await res.json();
    expect(body.error).toBe("Forbidden");
  });

  it("returns empty materials list when course has no units", async () => {
    mockSession.mockResolvedValueOnce(SESSION);
    // assertCourseOwnership → course owned by this user
    mockDbSelect.mockReturnValueOnce(makeChain([{ id: COURSE_ID }]));
    // courseUnits query → no units for this course
    mockDbSelect.mockReturnValueOnce(makeChain([]));

    const res = await GET(makeRequest(COURSE_ID));

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.materials).toEqual([]);
  });

  it("scopes driveFolders query to exact grade+quarter keys (IDOR fix)", async () => {
    mockSession.mockResolvedValueOnce(SESSION);
    // assertCourseOwnership → course owned by this user
    mockDbSelect.mockReturnValueOnce(makeChain([{ id: COURSE_ID }]));
    // courseUnits → one Q1 unit
    mockDbSelect.mockReturnValueOnce(makeChain([{ id: "unit-1", quarter: "Q1" }]));
    // grade query → grade 8
    mockDbSelect.mockReturnValueOnce(makeChain([{ grade: 8 }]));
    // driveFolders scoped query → one matching folder
    mockDbSelect.mockReturnValueOnce(makeChain([{ driveId: "drive-folder-g8-q1" }]));
    // materials in that folder → empty (triggers empty-materials short-circuit)
    mockDbSelect.mockReturnValueOnce(makeChain([]));

    const res = await GET(makeRequest(COURSE_ID));

    expect(res.status).toBe(200);
    // Verify inArray was called with the exact grade-qualified key, not a wildcard
    const inArrayCalls = mockInArray.mock.calls;
    const folderKeyCall = inArrayCalls.find(
      ([, vals]) => Array.isArray(vals) && vals.some((v: string) => v.includes("grade_")),
    );
    expect(folderKeyCall).toBeDefined();
    const passedKeys: string[] = folderKeyCall![1];
    // Must be exact grade-8-qualified keys — no "%" wildcard, no bare quarter substring
    expect(passedKeys).toEqual(["grade_8_Q1_Curriculum"]);
    expect(passedKeys.every((k: string) => !k.includes("%"))).toBe(true);
  });

  it("does not include another user's Q1 folder when grade differs", async () => {
    // User owns a grade-6 course. Only grade_6_Q1_Curriculum should be queried —
    // grade_8_Q1_Curriculum (another user's course) must not appear in the lookup.
    mockSession.mockResolvedValueOnce(SESSION);
    mockDbSelect.mockReturnValueOnce(makeChain([{ id: COURSE_ID }]));
    mockDbSelect.mockReturnValueOnce(makeChain([{ id: "unit-2", quarter: "Q1" }]));
    // grade 6 course
    mockDbSelect.mockReturnValueOnce(makeChain([{ grade: 6 }]));
    // driveFolders: returns only the grade-6 folder
    mockDbSelect.mockReturnValueOnce(makeChain([{ driveId: "drive-folder-g6-q1" }]));
    // materials → empty
    mockDbSelect.mockReturnValueOnce(makeChain([]));

    await GET(makeRequest(COURSE_ID));

    const inArrayCalls = mockInArray.mock.calls;
    const folderKeyCall = inArrayCalls.find(
      ([, vals]) => Array.isArray(vals) && vals.some((v: string) => v.includes("grade_")),
    );
    expect(folderKeyCall).toBeDefined();
    const passedKeys: string[] = folderKeyCall![1];
    expect(passedKeys).toEqual(["grade_6_Q1_Curriculum"]);
    // The grade-8 folder of a different user is never included in the query
    expect(passedKeys).not.toContain("grade_8_Q1_Curriculum");
  });

  it("returns populated materials list with attachment info when course has units and matching folders", async () => {
    const MATERIAL = {
      id: "mat-1",
      title: "Reading: Chapter 1",
      materialType: "reading",
      driveWebUrl: "https://drive.google.com/file/d/abc123",
      driveMimeType: "application/pdf",
      driveFolderId: "drive-folder-1",
      storageType: "google_drive",
      driveFileId: "abc123",
      description: null,
      source: "human",
      url: null,
      inlineContent: null,
      createdAt: new Date(),
      updatedAt: new Date(),
    };
    const ATTACHMENT = {
      id: "att-1",
      materialId: "mat-1",
      attachableType: "unit",
      attachableId: "unit-1",
      role: "supporting",
      sortOrder: 0,
    };

    mockSession.mockResolvedValueOnce(SESSION);
    // 1. assertCourseOwnership
    mockDbSelect.mockReturnValueOnce(makeChain([{ id: COURSE_ID }]));
    // 2. courseUnits
    mockDbSelect.mockReturnValueOnce(makeChain([{ id: "unit-1", quarter: "Q1" }]));
    // 3. grade query
    mockDbSelect.mockReturnValueOnce(makeChain([{ grade: 8 }]));
    // 4. driveFolders scoped to grade_8_Q1_Curriculum
    mockDbSelect.mockReturnValueOnce(makeChain([{ driveId: "drive-folder-1" }]));
    // 5. materials in that folder
    mockDbSelect.mockReturnValueOnce(makeChain([MATERIAL]));
    // 6. materialAttachments for those materials
    mockDbSelect.mockReturnValueOnce(makeChain([ATTACHMENT]));

    const res = await GET(makeRequest(COURSE_ID));

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.materials).toHaveLength(1);
    const mat = body.materials[0];
    expect(mat.id).toBe("mat-1");
    expect(mat.title).toBe("Reading: Chapter 1");
    expect(mat.materialType).toBe("reading");
    expect(mat.driveWebUrl).toBe("https://drive.google.com/file/d/abc123");
    expect(mat.driveMimeType).toBe("application/pdf");
    expect(mat.attachments).toHaveLength(1);
    expect(mat.attachments[0]).toMatchObject({
      id: "att-1",
      attachableType: "unit",
      attachableId: "unit-1",
      role: "supporting",
    });
  });

  it("falls back to attachment-based lookup when course has no grade set", async () => {
    const GRADE_NULL_MATERIAL = {
      id: "mat-no-grade-1",
      title: "Worksheet: No Grade",
      materialType: "activity",
      driveWebUrl: "https://drive.google.com/file/d/nograde",
      driveMimeType: "application/pdf",
      driveFolderId: null,
      storageType: "google_drive",
      driveFileId: "nograde",
      description: null,
      source: "human",
      url: null,
      inlineContent: null,
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    mockSession.mockResolvedValueOnce(SESSION);
    // 1. assertCourseOwnership
    mockDbSelect.mockReturnValueOnce(makeChain([{ id: COURSE_ID }]));
    // 2. courseUnits
    mockDbSelect.mockReturnValueOnce(makeChain([{ id: "unit-1", quarter: "Q1" }]));
    // 3. grade query → empty (no course row → grade is undefined → short-circuit skips driveFolders)
    mockDbSelect.mockReturnValueOnce(makeChain([]));
    // no driveFolders query — skipped because exactFolderKeys = []
    // 4. fallback: materialAttachments by unitIds
    mockDbSelect.mockReturnValueOnce(makeChain([{ materialId: "mat-no-grade-1" }]));
    // 5. fallback: materials by those IDs
    mockDbSelect.mockReturnValueOnce(makeChain([GRADE_NULL_MATERIAL]));
    // 6. final materialAttachments for these materials
    mockDbSelect.mockReturnValueOnce(makeChain([]));

    const res = await GET(makeRequest(COURSE_ID));

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.materials).toHaveLength(1);
    expect(body.materials[0].id).toBe("mat-no-grade-1");
    // The driveFolders short-circuit means inArray is never called with grade-qualified keys
    const gradeFolderCall = mockInArray.mock.calls.find(
      ([, vals]) => Array.isArray(vals) && vals.some((v: string) => v.includes("grade_")),
    );
    expect(gradeFolderCall).toBeUndefined();
  });

  it("falls back to materialAttachments query when no Drive folders match", async () => {
    const FALLBACK_MATERIAL = {
      id: "mat-fallback-1",
      title: "Activity Sheet",
      materialType: "activity",
      driveWebUrl: "https://drive.google.com/file/d/xyz",
      driveMimeType: "application/vnd.google-apps.document",
      driveFolderId: null,
      storageType: "google_drive",
      driveFileId: "xyz",
      description: null,
      source: "human",
      url: null,
      inlineContent: null,
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    mockSession.mockResolvedValueOnce(SESSION);
    // 1. assertCourseOwnership
    mockDbSelect.mockReturnValueOnce(makeChain([{ id: COURSE_ID }]));
    // 2. courseUnits
    mockDbSelect.mockReturnValueOnce(makeChain([{ id: "unit-1", quarter: "Q1" }]));
    // 3. grade query
    mockDbSelect.mockReturnValueOnce(makeChain([{ grade: 8 }]));
    // 4. driveFolders — empty, triggers fallback path
    mockDbSelect.mockReturnValueOnce(makeChain([]));
    // 5. fallback: materialAttachments by unitIds
    mockDbSelect.mockReturnValueOnce(makeChain([{ materialId: "mat-fallback-1" }]));
    // 6. fallback: materials by those IDs
    mockDbSelect.mockReturnValueOnce(makeChain([FALLBACK_MATERIAL]));
    // 7. materialAttachments for those materials
    mockDbSelect.mockReturnValueOnce(makeChain([]));

    const res = await GET(makeRequest(COURSE_ID));

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.materials).toHaveLength(1);
    const mat = body.materials[0];
    expect(mat.id).toBe("mat-fallback-1");
    expect(mat.title).toBe("Activity Sheet");
    expect(mat.materialType).toBe("activity");
    expect(mat.driveWebUrl).toBe("https://drive.google.com/file/d/xyz");
    expect(mat.attachments).toEqual([]);
  });
});
