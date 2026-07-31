import { describe, it, expect, vi, beforeEach } from "vitest";

// POST /api/courses/[id]/clone — fork a past year into the current one.
// Guard-path coverage (auth, ownership, year rules, 409 duplicate); the full
// tree-copy happy path is exercised against prod in the Grade-8 demo and
// protected by the source course never being written to.

const { mockDbSelect, mockDbInsert } = vi.hoisted(() => ({
  mockDbSelect: vi.fn(),
  mockDbInsert: vi.fn(),
}));

vi.mock("next-auth", () => ({ getServerSession: vi.fn() }));
vi.mock("@/lib/auth", () => ({ authOptions: {} }));
vi.mock("@/db", () => ({ db: { select: mockDbSelect, insert: mockDbInsert } }));
vi.mock("@/db/schema", () => ({
  courses: {},
  units: {},
  lessons: {},
  unitStandards: {},
  lessonStandards: {},
  materialAttachments: {},
  schoolYears: { isCurrent: {} },
}));
vi.mock("drizzle-orm", () => ({
  and: vi.fn(),
  asc: vi.fn(),
  eq: vi.fn(),
  inArray: vi.fn(),
}));

import { getServerSession } from "next-auth";
import { POST } from "../../src/app/api/courses/[id]/clone/route";

const mockGetServerSession = vi.mocked(getServerSession);
const SESSION = { user: { email: "heidi@example.com", id: "sub-1" }, expires: "" };
const COURSE_ID = "550e8400-e29b-41d4-a716-446655440000";
const SOURCE = {
  id: COURSE_ID,
  title: "ELA",
  grade: 8,
  subject: "ELA",
  schoolYearId: "sy-old",
  ownerEmail: "heidi@example.com",
  teacherNotes: null,
  meetingDays: "1,2,3,4,5",
};

function chain(rows: unknown) {
  const p = Promise.resolve(rows);
  const c: Record<string, unknown> = {};
  const self = () => c;
  for (const m of [
    "from",
    "where",
    "limit",
    "orderBy",
    "values",
    "returning",
    "onConflictDoNothing",
  ])
    c[m] = vi.fn(self);
  c.then = (r: (v: unknown) => unknown, j?: (e: unknown) => unknown) => p.then(r, j);
  return c;
}

const params = { params: Promise.resolve({ id: COURSE_ID }) };
const req = () =>
  new Request(`http://localhost/api/courses/${COURSE_ID}/clone`, { method: "POST" });

beforeEach(() => {
  vi.clearAllMocks();
  mockGetServerSession.mockResolvedValue(SESSION);
  mockDbSelect.mockImplementation(() => chain([]));
  mockDbInsert.mockImplementation(() => chain([{ id: "new-course" }]));
});

describe("POST /api/courses/[id]/clone", () => {
  it("401s without a session", async () => {
    mockGetServerSession.mockResolvedValueOnce(null);
    expect((await POST(req(), params)).status).toBe(401);
  });

  it("400s on a non-UUID id", async () => {
    const res = await POST(req(), { params: Promise.resolve({ id: "nope" }) });
    expect(res.status).toBe(400);
    expect(mockDbSelect).not.toHaveBeenCalled();
  });

  it("404s when the source course is not the caller's", async () => {
    expect((await POST(req(), params)).status).toBe(404);
    expect(mockDbInsert).not.toHaveBeenCalled();
  });

  it("400s when no current school year is set", async () => {
    mockDbSelect.mockImplementationOnce(() => chain([SOURCE]));
    expect((await POST(req(), params)).status).toBe(400);
    expect(mockDbInsert).not.toHaveBeenCalled();
  });

  it("400s when the course already lives in the current year", async () => {
    mockDbSelect
      .mockImplementationOnce(() => chain([{ ...SOURCE, schoolYearId: "sy-current" }]))
      .mockImplementationOnce(() => chain([{ id: "sy-current", name: "2026-2027" }]));
    expect((await POST(req(), params)).status).toBe(400);
    expect(mockDbInsert).not.toHaveBeenCalled();
  });

  it("409s when the grade already has a current-year course (no double-fork)", async () => {
    mockDbSelect
      .mockImplementationOnce(() => chain([SOURCE]))
      .mockImplementationOnce(() => chain([{ id: "sy-current", name: "2026-2027" }]))
      .mockImplementationOnce(() => chain([{ id: "already-cloned" }]));
    const res = await POST(req(), params);
    expect(res.status).toBe(409);
    expect(mockDbInsert).not.toHaveBeenCalled();
  });

  it("clones an empty course (course insert only, no unit/lesson inserts)", async () => {
    mockDbSelect
      .mockImplementationOnce(() => chain([SOURCE])) // owned source
      .mockImplementationOnce(() => chain([{ id: "sy-current", name: "2026-2027" }])) // current year
      .mockImplementationOnce(() => chain([])) // no duplicate
      .mockImplementation(() => chain([])); // units/lessons/standards/attachments all empty
    const res = await POST(req(), params);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.courseId).toBe("new-course");
    expect(body.unitCount).toBe(0);
    expect(mockDbInsert).toHaveBeenCalledTimes(1); // just the course row
  });
});
