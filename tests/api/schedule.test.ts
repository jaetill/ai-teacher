import { describe, it, expect, vi, beforeEach } from "vitest";

// /api/schedule/[courseId] — calendar inputs (#646). Placement itself is pure
// (tests/lib/schedule.test.ts); these tests pin auth, ownership scoping, and
// input validation on the storage route.

const { mockDbSelect, mockDbInsert, mockDbUpdate, mockDbDelete } = vi.hoisted(() => ({
  mockDbSelect: vi.fn(),
  mockDbInsert: vi.fn(),
  mockDbUpdate: vi.fn(),
  mockDbDelete: vi.fn(),
}));

vi.mock("next-auth", () => ({ getServerSession: vi.fn() }));
vi.mock("@/lib/auth", () => ({ authOptions: {} }));
vi.mock("@/db", () => ({
  db: { select: mockDbSelect, insert: mockDbInsert, update: mockDbUpdate, delete: mockDbDelete },
}));
vi.mock("@/db/schema", () => ({
  courses: { id: {}, grade: {}, title: {}, schoolYearId: {}, meetingDays: {}, ownerEmail: {} },
  schoolYears: { id: {}, name: {}, startDate: {}, endDate: {} },
  terms: { schoolYearId: {}, termType: {}, name: {}, sortOrder: {}, startDate: {}, endDate: {} },
}));
vi.mock("drizzle-orm", () => ({
  and: vi.fn(),
  asc: vi.fn(),
  eq: vi.fn(),
  inArray: vi.fn(),
}));

import { getServerSession } from "next-auth";
import { GET, PUT } from "../../src/app/api/schedule/[courseId]/route";

const mockGetServerSession = vi.mocked(getServerSession);
const SESSION = { user: { email: "heidi@example.com" }, expires: "" };
const COURSE_ID = "550e8400-e29b-41d4-a716-446655440000";
const COURSE = {
  id: COURSE_ID,
  grade: 7,
  title: "ELA",
  schoolYearId: "sy1",
  meetingDays: "1,2,3,4,5",
};

function chain(rows: unknown) {
  const p = Promise.resolve(rows);
  const c: Record<string, unknown> = {};
  const self = () => c;
  for (const m of ["from", "where", "limit", "orderBy", "set", "values"]) c[m] = vi.fn(self);
  c.then = (r: (v: unknown) => unknown, j?: (e: unknown) => unknown) => p.then(r, j);
  return c;
}

const params = { params: Promise.resolve({ courseId: COURSE_ID }) };
const getReq = () => new Request(`http://localhost/api/schedule/${COURSE_ID}`);
const putReq = (body: unknown) =>
  new Request(`http://localhost/api/schedule/${COURSE_ID}`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });

beforeEach(() => {
  vi.clearAllMocks();
  mockGetServerSession.mockResolvedValue(SESSION);
  mockDbSelect.mockImplementation(() => chain([]));
  mockDbInsert.mockImplementation(() => chain([]));
  mockDbUpdate.mockImplementation(() => chain([]));
  mockDbDelete.mockImplementation(() => chain([]));
});

describe("GET /api/schedule/[courseId]", () => {
  it("401s without a session", async () => {
    mockGetServerSession.mockResolvedValueOnce(null);
    expect((await GET(getReq(), params)).status).toBe(401);
  });

  it("400s on a non-UUID courseId", async () => {
    const res = await GET(getReq(), { params: Promise.resolve({ courseId: "nope" }) });
    expect(res.status).toBe(400);
    expect(mockDbSelect).not.toHaveBeenCalled();
  });

  it("404s when the owner-scoped course lookup finds nothing", async () => {
    // Another user's course id resolves to no row under the ownership predicate.
    expect((await GET(getReq(), params)).status).toBe(404);
  });

  it("returns spans split by term type", async () => {
    mockDbSelect
      .mockImplementationOnce(() => chain([COURSE]))
      .mockImplementationOnce(() =>
        chain([{ id: "sy1", name: "2026-2027", startDate: "2026-08-15", endDate: "2027-06-15" }]),
      )
      .mockImplementationOnce(() =>
        chain([
          { termType: "quarter", name: "Q1", startDate: "2026-08-31", endDate: "2026-10-30" },
          {
            termType: "no_school",
            name: "Snow day",
            startDate: "2026-09-14",
            endDate: "2026-09-14",
          },
        ]),
      );
    const res = await GET(getReq(), params);
    const body = await res.json();
    expect(body.quarterSpans).toEqual([
      { name: "Q1", startDate: "2026-08-31", endDate: "2026-10-30" },
    ]);
    expect(body.noSchoolDays).toEqual([{ date: "2026-09-14", label: "Snow day" }]);
    expect(body.meetingDays).toBe("1,2,3,4,5");
  });
});

describe("PUT /api/schedule/[courseId]", () => {
  it("rejects an invalid quarter span", async () => {
    mockDbSelect.mockImplementationOnce(() => chain([COURSE]));
    const res = await PUT(
      putReq({ quarterSpans: [{ name: "Q9", startDate: "2026-08-31", endDate: "2026-10-30" }] }),
      params,
    );
    expect(res.status).toBe(400);
    expect(mockDbDelete).not.toHaveBeenCalled();
  });

  it("rejects a reversed date range", async () => {
    mockDbSelect.mockImplementationOnce(() => chain([COURSE]));
    const res = await PUT(
      putReq({ quarterSpans: [{ name: "Q1", startDate: "2026-10-30", endDate: "2026-08-31" }] }),
      params,
    );
    expect(res.status).toBe(400);
  });

  it("rejects invalid meetingDays", async () => {
    mockDbSelect.mockImplementationOnce(() => chain([COURSE]));
    expect((await PUT(putReq({ meetingDays: "0,9" }), params)).status).toBe(400);
  });

  it("replaces quarter terms and no-school days on a valid save", async () => {
    mockDbSelect.mockImplementationOnce(() => chain([COURSE]));
    const res = await PUT(
      putReq({
        meetingDays: "1,3,5",
        quarterSpans: [{ name: "Q1", startDate: "2026-08-31", endDate: "2026-10-30" }],
        noSchoolDays: [{ date: "2026-09-14", label: "Snow day" }],
      }),
      params,
    );
    expect(res.status).toBe(200);
    expect(mockDbUpdate).toHaveBeenCalledTimes(1); // meetingDays
    expect(mockDbDelete).toHaveBeenCalledTimes(2); // quarters + no_school replaced
    expect(mockDbInsert).toHaveBeenCalledTimes(2);
  });

  it("400s when the course has no school year", async () => {
    mockDbSelect.mockImplementationOnce(() => chain([{ ...COURSE, schoolYearId: null }]));
    expect((await PUT(putReq({ meetingDays: "1,2" }), params)).status).toBe(400);
  });
});
