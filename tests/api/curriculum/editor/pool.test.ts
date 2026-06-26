import { describe, it, expect, vi, beforeEach } from "vitest";

// ── Hoisted mocks ─────────────────────────────────────────────────────────────
const { mockDbSelect } = vi.hoisted(() => ({
  mockDbSelect: vi.fn(),
}));

vi.mock("next-auth", () => ({ getServerSession: vi.fn() }));
vi.mock("@/lib/auth", () => ({ authOptions: {} }));
vi.mock("@/db", () => ({ db: { select: mockDbSelect } }));
vi.mock("@/db/schema", () => ({
  materials: {},
  materialAttachments: {},
  units: {},
  driveFolders: {},
  courses: {},
}));
vi.mock("drizzle-orm", () => ({
  eq: vi.fn(),
  inArray: vi.fn(),
  sql: vi.fn(),
  and: vi.fn(),
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

  it("returns populated materials list with attachment info when course has units and matching folders", async () => {
    mockSession.mockResolvedValueOnce(SESSION);
    // assertCourseOwnership → course owned by this user
    mockDbSelect.mockReturnValueOnce(makeChain([{ id: COURSE_ID }]));
    // courseUnits → one unit in Q1
    mockDbSelect.mockReturnValueOnce(makeChain([{ id: "unit-1", quarter: "Q1" }]));
    // allFolders → one folder whose key contains "Q1"
    mockDbSelect.mockReturnValueOnce(
      makeChain([{ folderKey: "grade_5_Q1_Curriculum", driveId: "drive-folder-1" }]),
    );
    // courseMaterials via inArray on driveFolderId
    mockDbSelect.mockReturnValueOnce(
      makeChain([
        {
          id: "mat-1",
          title: "Material 1",
          materialType: "worksheet",
          driveWebUrl: "https://drive.google.com/mat1",
          driveMimeType: "application/pdf",
          driveFolderId: "drive-folder-1",
        },
      ]),
    );
    // attachments for mat-1
    mockDbSelect.mockReturnValueOnce(
      makeChain([
        {
          id: "att-1",
          materialId: "mat-1",
          attachableType: "unit",
          attachableId: "unit-1",
          role: "main",
        },
      ]),
    );

    const res = await GET(makeRequest(COURSE_ID));

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.materials).toHaveLength(1);
    expect(body.materials[0]).toMatchObject({
      id: "mat-1",
      title: "Material 1",
      materialType: "worksheet",
      driveWebUrl: "https://drive.google.com/mat1",
      driveMimeType: "application/pdf",
      attachments: [{ id: "att-1", attachableType: "unit", attachableId: "unit-1", role: "main" }],
    });
  });

  it("returns materials via attachment fallback when no Drive folders match course quarters", async () => {
    mockSession.mockResolvedValueOnce(SESSION);
    // assertCourseOwnership → course owned by this user
    mockDbSelect.mockReturnValueOnce(makeChain([{ id: COURSE_ID }]));
    // courseUnits → one unit in Q2
    mockDbSelect.mockReturnValueOnce(makeChain([{ id: "unit-2", quarter: "Q2" }]));
    // allFolders → folder key contains "Q1", not "Q2" → no match
    mockDbSelect.mockReturnValueOnce(
      makeChain([{ folderKey: "grade_5_Q1_Curriculum", driveId: "drive-folder-1" }]),
    );
    // materialAttachments fallback query → mat-2 is attached to unit-2
    mockDbSelect.mockReturnValueOnce(makeChain([{ materialId: "mat-2" }]));
    // materials by materialIds
    mockDbSelect.mockReturnValueOnce(
      makeChain([
        {
          id: "mat-2",
          title: "Fallback Material",
          materialType: "document",
          driveWebUrl: "https://drive.google.com/mat2",
          driveMimeType: "text/plain",
          driveFolderId: null,
        },
      ]),
    );
    // final attachments query → none
    mockDbSelect.mockReturnValueOnce(makeChain([]));

    const res = await GET(makeRequest(COURSE_ID));

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.materials).toHaveLength(1);
    expect(body.materials[0]).toMatchObject({
      id: "mat-2",
      title: "Fallback Material",
      materialType: "document",
      driveWebUrl: "https://drive.google.com/mat2",
      driveMimeType: "text/plain",
      attachments: [],
    });
  });
});
