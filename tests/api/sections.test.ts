import { describe, it, expect, vi, beforeEach } from "vitest";

// /api/sections — the calendar's row unit. Owner scoping runs through the
// section's course in every method.

const { mockDbSelect, mockDbInsert, mockDbDelete, mockDbUpdate } = vi.hoisted(() => ({
  mockDbSelect: vi.fn(),
  mockDbInsert: vi.fn(),
  mockDbDelete: vi.fn(),
  mockDbUpdate: vi.fn(),
}));

vi.mock("next-auth", () => ({ getServerSession: vi.fn() }));
vi.mock("@/lib/auth", () => ({ authOptions: {} }));
vi.mock("@/db", () => ({
  db: { select: mockDbSelect, insert: mockDbInsert, delete: mockDbDelete, update: mockDbUpdate },
}));
vi.mock("@/db/schema", () => ({
  courses: { id: {}, grade: {}, title: {}, schoolYearId: {}, ownerEmail: {} },
  sections: { id: {}, name: {}, period: {}, meetingDays: {}, courseId: {} },
}));
vi.mock("drizzle-orm", () => ({ and: vi.fn(), asc: vi.fn(), eq: vi.fn() }));

import { getServerSession } from "next-auth";
import { GET, POST, PATCH, DELETE } from "../../src/app/api/sections/route";

const mockGetServerSession = vi.mocked(getServerSession);
const SESSION = { user: { email: "heidi@example.com" }, expires: "" };
const COURSE_ID = "550e8400-e29b-41d4-a716-446655440000";
const SECTION_ID = "550e8400-e29b-41d4-a716-446655440111";

function chain(rows: unknown) {
  const p = Promise.resolve(rows);
  const c: Record<string, unknown> = {};
  const self = () => c;
  for (const m of ["from", "innerJoin", "where", "limit", "orderBy", "values", "returning", "set"])
    c[m] = vi.fn(self);
  c.then = (r: (v: unknown) => unknown, j?: (e: unknown) => unknown) => p.then(r, j);
  return c;
}

const post = (body: unknown) =>
  new Request("http://localhost/api/sections", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
const del = (id: string) =>
  new Request(`http://localhost/api/sections?id=${id}`, { method: "DELETE" });

beforeEach(() => {
  vi.clearAllMocks();
  mockGetServerSession.mockResolvedValue(SESSION);
  mockDbSelect.mockImplementation(() => chain([]));
  mockDbInsert.mockImplementation(() => chain([{ id: SECTION_ID }]));
  mockDbDelete.mockImplementation(() => chain([]));
  mockDbUpdate.mockImplementation(() => chain([]));
});

describe("GET /api/sections", () => {
  it("401s without a session", async () => {
    mockGetServerSession.mockResolvedValueOnce(null);
    expect((await GET()).status).toBe(401);
  });
  it("returns the owner's sections", async () => {
    mockDbSelect.mockImplementationOnce(() =>
      chain([{ id: SECTION_ID, name: "Period 1", period: "1", courseId: COURSE_ID, grade: 8 }]),
    );
    const body = await (await GET()).json();
    expect(body.sections).toHaveLength(1);
    expect(body.sections[0].name).toBe("Period 1");
  });
});

describe("POST /api/sections", () => {
  it("400s on a non-UUID courseId", async () => {
    const res = await POST(post({ courseId: "nope", name: "Period 1" }));
    expect(res.status).toBe(400);
    expect(mockDbSelect).not.toHaveBeenCalled();
  });
  it("400s on a missing/blank name", async () => {
    expect((await POST(post({ courseId: COURSE_ID, name: "  " }))).status).toBe(400);
  });
  it("404s when the course is not the caller's (ownership predicate)", async () => {
    expect((await POST(post({ courseId: COURSE_ID, name: "Period 1" }))).status).toBe(404);
    expect(mockDbInsert).not.toHaveBeenCalled();
  });
  it("400s when the course has no school year", async () => {
    mockDbSelect.mockImplementationOnce(() => chain([{ id: COURSE_ID, schoolYearId: null }]));
    expect((await POST(post({ courseId: COURSE_ID, name: "Period 1" }))).status).toBe(400);
  });
  it("creates the section for an owned course", async () => {
    mockDbSelect.mockImplementationOnce(() => chain([{ id: COURSE_ID, schoolYearId: "sy1" }]));
    const res = await POST(post({ courseId: COURSE_ID, name: "Period 1", period: "1" }));
    expect(res.status).toBe(200);
    expect((await res.json()).id).toBe(SECTION_ID);
    expect(mockDbInsert).toHaveBeenCalledTimes(1);
  });
});

describe("DELETE /api/sections", () => {
  it("400s on a non-UUID id", async () => {
    expect((await DELETE(del("nope"))).status).toBe(400);
  });
  it("404s when the section does not resolve through an owned course", async () => {
    expect((await DELETE(del(SECTION_ID))).status).toBe(404);
    expect(mockDbDelete).not.toHaveBeenCalled();
  });
  it("deletes an owned section", async () => {
    mockDbSelect.mockImplementationOnce(() => chain([{ id: SECTION_ID }]));
    expect((await DELETE(del(SECTION_ID))).status).toBe(200);
    expect(mockDbDelete).toHaveBeenCalledTimes(1);
  });
});

describe("PATCH /api/sections", () => {
  const patch = (body: unknown) =>
    new Request("http://localhost/api/sections", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });

  it("400s on a non-UUID id", async () => {
    expect((await PATCH(patch({ id: "nope", meetingDays: "1,3" }))).status).toBe(400);
  });

  it("400s on out-of-range meeting days", async () => {
    expect((await PATCH(patch({ id: SECTION_ID, meetingDays: "0,9" }))).status).toBe(400);
    expect(mockDbUpdate).not.toHaveBeenCalled();
  });

  it("400s when nothing to update was sent", async () => {
    expect((await PATCH(patch({ id: SECTION_ID }))).status).toBe(400);
  });

  it("404s when the section is not the caller's", async () => {
    expect((await PATCH(patch({ id: SECTION_ID, meetingDays: "1,3" }))).status).toBe(404);
    expect(mockDbUpdate).not.toHaveBeenCalled();
  });

  it("saves a per-section meeting-day override, deduped and sorted", async () => {
    mockDbSelect.mockImplementationOnce(() => chain([{ id: SECTION_ID }]));
    const setSpy = vi.fn();
    setSpy.mockReturnValue(chain([]));
    mockDbUpdate.mockImplementationOnce(() => ({ set: setSpy }));

    const res = await PATCH(patch({ id: SECTION_ID, meetingDays: "3,1,3" }));

    expect(res.status).toBe(200);
    expect(setSpy).toHaveBeenCalledTimes(1);
    expect(setSpy.mock.calls[0][0]).toEqual({ meetingDays: "1,3" });
  });

  it("clears the override back to inheriting the course", async () => {
    mockDbSelect.mockImplementationOnce(() => chain([{ id: SECTION_ID }]));
    const res = await PATCH(patch({ id: SECTION_ID, meetingDays: null }));
    expect(res.status).toBe(200);
    expect(mockDbUpdate).toHaveBeenCalledTimes(1);
  });
});
