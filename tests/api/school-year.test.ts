import { describe, it, expect, vi, beforeEach } from "vitest";

// /api/school-year — year-level calendar settings (dates, quarter spans,
// no-school days). These were previously edited per course even though they
// were stored per year, so setting one course's quarters silently moved every
// other course's. One endpoint, one edit, every section.

const { mockDbSelect, mockDbInsert, mockDbUpdate, mockDbDelete } = vi.hoisted(() => ({
  mockDbSelect: vi.fn(),
  mockDbInsert: vi.fn(),
  mockDbUpdate: vi.fn(),
  mockDbDelete: vi.fn(),
}));

vi.mock("next-auth", () => ({ getServerSession: vi.fn() }));
vi.mock("@/lib/auth", () => ({ authOptions: {} }));
const { mockDbBatch } = vi.hoisted(() => ({ mockDbBatch: vi.fn().mockResolvedValue([]) }));
vi.mock("@/db", () => ({
  db: { batch: mockDbBatch, select: mockDbSelect, insert: mockDbInsert, update: mockDbUpdate, delete: mockDbDelete },
}));
vi.mock("@/db/schema", () => ({
  schoolYears: { id: {}, name: {}, startDate: {}, endDate: {}, isCurrent: {} },
  terms: { schoolYearId: {}, termType: {}, name: {}, sortOrder: {}, startDate: {}, endDate: {} },
}));
vi.mock("drizzle-orm", () => ({
  and: vi.fn(),
  asc: vi.fn(),
  desc: vi.fn(),
  eq: vi.fn(),
  inArray: vi.fn(),
}));

import { getServerSession } from "next-auth";
import { GET, PUT } from "../../src/app/api/school-year/route";

const mockGetServerSession = vi.mocked(getServerSession);
const SESSION = { user: { email: "heidi@example.com" }, expires: "" };
const YEAR = {
  id: "550e8400-e29b-41d4-a716-446655440000",
  name: "2026-2027",
  startDate: "2026-08-15",
  endDate: "2027-06-15",
  isCurrent: true,
};

function chain(rows: unknown) {
  const p = Promise.resolve(rows);
  const c: Record<string, unknown> = {};
  const self = () => c;
  for (const m of ["from", "where", "limit", "orderBy", "set", "values"]) c[m] = vi.fn(self);
  c.then = (r: (v: unknown) => unknown, j?: (e: unknown) => unknown) => p.then(r, j);
  return c;
}

const getReq = (qs = "") => new Request(`http://localhost/api/school-year${qs}`);
const putReq = (body: unknown) =>
  new Request("http://localhost/api/school-year", {
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

describe("GET /api/school-year", () => {
  it("401s without a session", async () => {
    mockGetServerSession.mockResolvedValueOnce(null);
    expect((await GET(getReq())).status).toBe(401);
  });

  it("400s on a non-UUID id param", async () => {
    expect((await GET(getReq("?id=nope"))).status).toBe(400);
  });

  it("404s when there is no school year at all", async () => {
    expect((await GET(getReq())).status).toBe(404);
  });

  it("returns the current year with its quarters and no-school days", async () => {
    mockDbSelect
      .mockImplementationOnce(() => chain([YEAR]))
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
    const body = await (await GET(getReq())).json();
    expect(body.schoolYear.name).toBe("2026-2027");
    expect(body.schoolYear.startDate).toBe("2026-08-15");
    expect(body.quarterSpans).toEqual([
      { name: "Q1", startDate: "2026-08-31", endDate: "2026-10-30" },
    ]);
    expect(body.noSchoolDays).toEqual([{ date: "2026-09-14", label: "Snow day" }]);
  });
});

describe("PUT /api/school-year", () => {
  it("401s without a session", async () => {
    mockGetServerSession.mockResolvedValueOnce(null);
    expect((await PUT(putReq({}))).status).toBe(401);
  });

  it("rejects a reversed year range", async () => {
    mockDbSelect.mockImplementationOnce(() => chain([YEAR]));
    const res = await PUT(putReq({ startDate: "2027-06-15", endDate: "2026-08-15" }));
    expect(res.status).toBe(400);
    expect(mockDbUpdate).not.toHaveBeenCalled();
  });

  it("rejects an unknown quarter name", async () => {
    mockDbSelect.mockImplementationOnce(() => chain([YEAR]));
    const res = await PUT(
      putReq({ quarterSpans: [{ name: "Q9", startDate: "2026-08-31", endDate: "2026-10-30" }] }),
    );
    expect(res.status).toBe(400);
    expect(mockDbDelete).not.toHaveBeenCalled();
  });

  it("rejects a malformed no-school date", async () => {
    mockDbSelect.mockImplementationOnce(() => chain([YEAR]));
    expect((await PUT(putReq({ noSchoolDays: [{ date: "tuesday" }] }))).status).toBe(400);
  });

  it("saves year dates, quarters, and no-school days together", async () => {
    mockDbSelect.mockImplementationOnce(() => chain([YEAR]));
    const res = await PUT(
      putReq({
        startDate: "2026-08-20",
        endDate: "2027-06-10",
        quarterSpans: [{ name: "Q1", startDate: "2026-08-31", endDate: "2026-10-30" }],
        noSchoolDays: [{ date: "2026-09-14", label: "Snow day" }],
      }),
    );
    expect(res.status).toBe(200);
    expect(mockDbUpdate).toHaveBeenCalledTimes(1); // year dates
    expect(mockDbDelete).toHaveBeenCalledTimes(2); // quarters + no_school replaced
    expect(mockDbInsert).toHaveBeenCalledTimes(2);
    // …all five in ONE batch: a failure between a delete and its insert can no
    // longer leave the year with no quarters.
    expect(mockDbBatch).toHaveBeenCalledTimes(1);
    expect(mockDbBatch.mock.calls[0][0]).toHaveLength(5);
  });

  it("updates only no-school days when that's all that's sent (the ❄ button)", async () => {
    mockDbSelect.mockImplementationOnce(() => chain([YEAR]));
    const res = await PUT(putReq({ noSchoolDays: [{ date: "2027-01-08", label: "Snow day" }] }));
    expect(res.status).toBe(200);
    expect(mockDbUpdate).not.toHaveBeenCalled(); // year dates untouched
    expect(mockDbDelete).toHaveBeenCalledTimes(1); // only the no_school rows
    expect(mockDbInsert).toHaveBeenCalledTimes(1);
    expect(mockDbBatch).toHaveBeenCalledTimes(1);
    expect(mockDbBatch.mock.calls[0][0]).toHaveLength(2);
  });
});
