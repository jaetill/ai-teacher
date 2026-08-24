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
  lessons: {},
  assessments: {},
  driveFolders: { folderKey: "folderKey", driveId: "driveId" },
  courses: { grade: "grade" },
}));
vi.mock("drizzle-orm", () => ({
  eq: vi.fn(),
  inArray: mockInArray,
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

// All five category folders are loaded per quarter now (not just Curriculum).
const CATS = ["Curriculum", "Lessons", "Activities", "Assessments", "Resources"];
const keysFor = (grade: number, quarter: string) =>
  CATS.map((c) => `grade_${grade}_${quarter}_${c}`);

const COURSE_ID = "550e8400-e29b-41d4-a716-446655440000";
const SESSION = { user: { email: "teacher@example.com" }, expires: "" };

function material(over: Record<string, unknown> = {}) {
  return {
    id: "mat-1",
    title: "Reading: Chapter 1",
    materialType: "reading",
    sourceUnit: "The Giver",
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
    ...over,
  };
}

describe("GET /api/curriculum/editor/pool", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // mockReset, not just clearAllMocks: clearing leaves the mockReturnValueOnce
    // queue intact, so a test that primes more chains than the route consumes
    // silently shifts every query in the NEXT test by one.
    mockDbSelect.mockReset();
    // The route ends with a placement query for materials the plan pipeline
    // imported (course_id set, no folder of ours). Default every unprimed
    // select to empty so these folder-era cases stay about the folder path,
    // and so adding a query later does not break the whole file again.
    mockDbSelect.mockImplementation(() => makeChain([]));
  });

  it("returns 401 when there is no session", async () => {
    mockSession.mockResolvedValueOnce(null);
    const res = await GET(makeRequest(COURSE_ID));
    expect(res.status).toBe(401);
    expect((await res.json()).error).toBe("Not authenticated");
  });

  it("returns 401 when session has no email", async () => {
    mockSession.mockResolvedValueOnce({ user: {}, expires: "" });
    const res = await GET(makeRequest(COURSE_ID));
    expect(res.status).toBe(401);
    expect((await res.json()).error).toBe("Not authenticated");
  });

  it("returns 400 when courseId is missing", async () => {
    mockSession.mockResolvedValueOnce(SESSION);
    const res = await GET(makeRequest());
    expect(res.status).toBe(400);
    expect((await res.json()).error).toBe("courseId required");
  });

  it("returns 400 when courseId is not a UUID (#595)", async () => {
    mockSession.mockResolvedValueOnce(SESSION);
    const res = await GET(makeRequest("not-a-uuid"));
    expect(res.status).toBe(400);
    expect((await res.json()).error).toBe("Invalid courseId");
  });

  it("returns 403 when session user does not own the course (IDOR guard)", async () => {
    mockSession.mockResolvedValueOnce(SESSION);
    mockDbSelect.mockReturnValueOnce(makeChain([])); // ownership → not owned
    const res = await GET(makeRequest(COURSE_ID));
    expect(res.status).toBe(403);
    expect((await res.json()).error).toBe("Forbidden");
  });

  it("returns empty materials list when course has no units", async () => {
    mockSession.mockResolvedValueOnce(SESSION);
    mockDbSelect.mockReturnValueOnce(makeChain([{ id: COURSE_ID }])); // ownership
    mockDbSelect.mockReturnValueOnce(makeChain([])); // courseUnits → none
    const res = await GET(makeRequest(COURSE_ID));
    expect(res.status).toBe(200);
    expect((await res.json()).materials).toEqual([]);
  });

  it("loads ALL five category folders for the course's grade+quarter (not just Curriculum)", async () => {
    mockSession.mockResolvedValueOnce(SESSION);
    mockDbSelect.mockReturnValueOnce(makeChain([{ id: COURSE_ID }])); // ownership
    mockDbSelect.mockReturnValueOnce(makeChain([{ id: "unit-1", quarter: "Q1" }])); // units
    mockDbSelect.mockReturnValueOnce(makeChain([{ grade: 8 }])); // grade
    mockDbSelect.mockReturnValueOnce(makeChain([{ driveId: "drive-folder-g8-q1" }])); // folders
    mockDbSelect.mockReturnValueOnce(makeChain([])); // materials → empty short-circuit

    const res = await GET(makeRequest(COURSE_ID));
    expect(res.status).toBe(200);

    const folderKeyCall = mockInArray.mock.calls.find(
      ([, vals]) => Array.isArray(vals) && vals.some((v: string) => v.includes("grade_")),
    );
    expect(folderKeyCall).toBeDefined();
    const passedKeys: string[] = folderKeyCall![1];
    expect(passedKeys).toEqual(keysFor(8, "Q1")); // all 5 categories
    expect(passedKeys.every((k) => !k.includes("%"))).toBe(true);
  });

  it("scopes folder keys to the course's own grade (no cross-grade leakage)", async () => {
    mockSession.mockResolvedValueOnce(SESSION);
    mockDbSelect.mockReturnValueOnce(makeChain([{ id: COURSE_ID }]));
    mockDbSelect.mockReturnValueOnce(makeChain([{ id: "unit-2", quarter: "Q1" }]));
    mockDbSelect.mockReturnValueOnce(makeChain([{ grade: 6 }]));
    mockDbSelect.mockReturnValueOnce(makeChain([{ driveId: "drive-folder-g6-q1" }]));
    mockDbSelect.mockReturnValueOnce(makeChain([]));

    await GET(makeRequest(COURSE_ID));

    const folderKeyCall = mockInArray.mock.calls.find(
      ([, vals]) => Array.isArray(vals) && vals.some((v: string) => v.includes("grade_")),
    );
    const passedKeys: string[] = folderKeyCall![1];
    expect(passedKeys).toEqual(keysFor(6, "Q1"));
    expect(passedKeys).not.toContain("grade_8_Q1_Curriculum");
  });

  it("returns materials with attachment info and the teacher's sourceUnit", async () => {
    const ATTACHMENT = {
      id: "att-1",
      materialId: "mat-1",
      attachableType: "lesson",
      attachableId: "lesson-1",
      role: "primary",
      sortOrder: 0,
    };
    mockSession.mockResolvedValueOnce(SESSION);
    mockDbSelect.mockReturnValueOnce(makeChain([{ id: COURSE_ID }])); // ownership
    mockDbSelect.mockReturnValueOnce(makeChain([{ id: "unit-1", quarter: "Q1" }])); // units
    mockDbSelect.mockReturnValueOnce(makeChain([{ grade: 8 }])); // grade
    mockDbSelect.mockReturnValueOnce(makeChain([{ driveId: "drive-folder-1" }])); // folders
    mockDbSelect.mockReturnValueOnce(makeChain([material()])); // materials
    mockDbSelect.mockReturnValueOnce(makeChain([])); // materials by placement → none
    mockDbSelect.mockReturnValueOnce(makeChain([ATTACHMENT])); // attachments

    const res = await GET(makeRequest(COURSE_ID));
    expect(res.status).toBe(200);
    const mat = (await res.json()).materials[0];
    expect(mat.id).toBe("mat-1");
    expect(mat.materialType).toBe("reading");
    expect(mat.sourceUnit).toBe("The Giver");
    expect(mat.attachments[0]).toMatchObject({ attachableType: "lesson", role: "primary" });
  });

  // Between import and build a course has materials but no units. The route
  // used to bail on an empty unit list, which meant she imported files and the
  // pool showed her nothing.
  it("returns placement-imported materials for a course that has no units yet", async () => {
    mockSession.mockResolvedValueOnce(SESSION);
    mockDbSelect.mockReturnValueOnce(makeChain([{ id: COURSE_ID }])); // ownership
    mockDbSelect.mockReturnValueOnce(makeChain([])); // units → none built yet
    // No units means no quarters, so no folder keys are built and the
    // driveFolders query is skipped entirely.
    mockDbSelect.mockReturnValueOnce(makeChain([{ grade: 7 }])); // grade
    mockDbSelect.mockReturnValueOnce(makeChain([])); // fallback: lessons
    mockDbSelect.mockReturnValueOnce(makeChain([])); // fallback: assessments
    mockDbSelect.mockReturnValueOnce(makeChain([material()])); // materials by placement
    mockDbSelect.mockReturnValueOnce(makeChain([])); // attachments

    const res = await GET(makeRequest(COURSE_ID));

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.materials).toHaveLength(1);
    expect(body.materials[0].id).toBe("mat-1");
  });

  it("fallback (no registered folders) matches attachments on units, lessons AND assessments", async () => {
    mockSession.mockResolvedValueOnce(SESSION);
    mockDbSelect.mockReturnValueOnce(makeChain([{ id: COURSE_ID }])); // ownership
    mockDbSelect.mockReturnValueOnce(makeChain([{ id: "unit-1", quarter: "Q1" }])); // units
    mockDbSelect.mockReturnValueOnce(makeChain([{ grade: 8 }])); // grade
    mockDbSelect.mockReturnValueOnce(makeChain([])); // folders → none → fallback
    mockDbSelect.mockReturnValueOnce(makeChain([{ id: "lesson-1" }])); // fallback: lessons
    mockDbSelect.mockReturnValueOnce(makeChain([{ id: "assess-1" }])); // fallback: assessments
    mockDbSelect.mockReturnValueOnce(makeChain([{ materialId: "mat-1" }])); // attachments → materialIds
    mockDbSelect.mockReturnValueOnce(makeChain([material({ materialType: "activity" })])); // materials
    mockDbSelect.mockReturnValueOnce(makeChain([])); // materials by placement → none
    mockDbSelect.mockReturnValueOnce(makeChain([])); // final attachments

    const res = await GET(makeRequest(COURSE_ID));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.materials).toHaveLength(1);
    expect(body.materials[0].id).toBe("mat-1");

    // The fallback attachment lookup must include the lesson/assessment ids, not
    // just the unit id — the build attaches to lessons.
    const attachIdsCall = mockInArray.mock.calls.find(
      ([, vals]) => Array.isArray(vals) && vals.includes("lesson-1") && vals.includes("assess-1"),
    );
    expect(attachIdsCall).toBeDefined();
    expect(attachIdsCall![1]).toEqual(expect.arrayContaining(["unit-1", "lesson-1", "assess-1"]));
  });

  it("returns empty when the fallback finds no attached materials", async () => {
    mockSession.mockResolvedValueOnce(SESSION);
    mockDbSelect.mockReturnValueOnce(makeChain([{ id: COURSE_ID }])); // ownership
    mockDbSelect.mockReturnValueOnce(makeChain([{ id: "unit-1", quarter: "Q1" }])); // units
    mockDbSelect.mockReturnValueOnce(makeChain([{ grade: 8 }])); // grade
    mockDbSelect.mockReturnValueOnce(makeChain([])); // folders → none → fallback
    mockDbSelect.mockReturnValueOnce(makeChain([])); // fallback: lessons
    mockDbSelect.mockReturnValueOnce(makeChain([])); // fallback: assessments
    mockDbSelect.mockReturnValueOnce(makeChain([])); // attachments → none

    const res = await GET(makeRequest(COURSE_ID));
    expect(res.status).toBe(200);
    expect((await res.json()).materials).toEqual([]);
  });
});
