import { describe, it, expect, vi, beforeEach } from "vitest";

const { mockDbUpdate, mockDbSelect, mockDbDelete, mockDbBatch } = vi.hoisted(() => ({
  mockDbUpdate: vi.fn(),
  mockDbSelect: vi.fn(),
  mockDbDelete: vi.fn(),
  mockDbBatch: vi.fn(),
}));

vi.mock("next-auth", () => ({ getServerSession: vi.fn() }));
vi.mock("@/lib/auth", () => ({ authOptions: {} }));
vi.mock("@/db", () => ({
  db: {
    update: mockDbUpdate,
    select: mockDbSelect,
    delete: mockDbDelete,
    batch: mockDbBatch,
  },
}));
vi.mock("@/db/schema", () => ({
  courses: {},
  units: {},
  lessons: {},
  assessments: {},
  materialAttachments: {},
}));
vi.mock("drizzle-orm", () => ({ eq: vi.fn(), and: vi.fn(), inArray: vi.fn() }));

import { getServerSession } from "next-auth";
import { PATCH, DELETE } from "../../src/app/api/courses/[id]/route";

const mockGetServerSession = vi.mocked(getServerSession);

function makeChain(value: unknown) {
  const p = Promise.resolve(value);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const chain: Record<string, any> = {};
  const self = () => chain;
  for (const m of ["set", "where", "returning", "from", "limit"]) chain[m] = vi.fn(self);
  chain.then = (r: (v: unknown) => unknown, j?: (e: unknown) => unknown) => p.then(r, j);
  chain.catch = (j: (e: unknown) => unknown) => p.catch(j);
  chain.finally = (fn: () => void) => p.finally(fn);
  return chain;
}

const OWNER = "teacher@school.edu";
const SESSION = { user: { email: OWNER }, expires: "" };
const VALID = "550e8400-e29b-41d4-a716-446655440001";
const params = (id: string) => ({ params: Promise.resolve({ id }) });

function req(body: unknown) {
  return new Request(`http://localhost/api/courses/${VALID}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

beforeEach(() => vi.clearAllMocks());

describe("PATCH /api/courses/[id]", () => {
  it("401 when unauthenticated", async () => {
    mockGetServerSession.mockResolvedValueOnce(null);
    const res = await PATCH(req({ title: "New" }), params(VALID));
    expect(res.status).toBe(401);
  });

  it("400 on non-UUID id", async () => {
    mockGetServerSession.mockResolvedValueOnce(SESSION);
    const res = await PATCH(req({ title: "New" }), params("nope"));
    expect(res.status).toBe(400);
  });

  it("400 on empty title", async () => {
    mockGetServerSession.mockResolvedValueOnce(SESSION);
    const res = await PATCH(req({ title: "   " }), params(VALID));
    expect(res.status).toBe(400);
  });

  it("400 on malformed JSON", async () => {
    mockGetServerSession.mockResolvedValueOnce(SESSION);
    const bad = new Request(`http://localhost/api/courses/${VALID}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: "{",
    });
    const res = await PATCH(bad, params(VALID));
    expect(res.status).toBe(400);
  });

  it("404 when no owned row matches", async () => {
    mockGetServerSession.mockResolvedValueOnce(SESSION);
    mockDbUpdate.mockReturnValueOnce(makeChain([])); // returning() → no rows
    const res = await PATCH(req({ title: "New title" }), params(VALID));
    expect(res.status).toBe(404);
  });

  it("200 and echoes the renamed course", async () => {
    mockGetServerSession.mockResolvedValueOnce(SESSION);
    mockDbUpdate.mockReturnValueOnce(makeChain([{ id: VALID, title: "New title" }]));
    const res = await PATCH(req({ title: "  New title  " }), params(VALID));
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.ok).toBe(true);
    expect(data.course.title).toBe("New title");
  });
});

function delReq() {
  return new Request(`http://localhost/api/courses/${VALID}`, { method: "DELETE" });
}

describe("DELETE /api/courses/[id]", () => {
  it("401 when unauthenticated", async () => {
    mockGetServerSession.mockResolvedValueOnce(null);
    const res = await DELETE(delReq(), params(VALID));
    expect(res.status).toBe(401);
  });

  it("400 on non-UUID id", async () => {
    mockGetServerSession.mockResolvedValueOnce(SESSION);
    const res = await DELETE(delReq(), params("nope"));
    expect(res.status).toBe(400);
  });

  it("404 when the course isn't owned by the caller", async () => {
    mockGetServerSession.mockResolvedValueOnce(SESSION);
    mockDbSelect.mockReturnValueOnce(makeChain([])); // owner check → none
    const res = await DELETE(delReq(), params(VALID));
    expect(res.status).toBe(404);
  });

  it("200 and cleans up attachments + deletes course atomically", async () => {
    mockGetServerSession.mockResolvedValueOnce(SESSION);
    mockDbSelect
      .mockReturnValueOnce(makeChain([{ id: VALID }])) // owner check
      .mockReturnValueOnce(makeChain([{ id: "unit-1" }])) // units
      .mockReturnValueOnce(makeChain([{ id: "lesson-1" }])) // lessons
      .mockReturnValueOnce(makeChain([{ id: "assess-1" }])); // assessments
    mockDbDelete.mockReturnValue(makeChain(undefined));
    mockDbBatch.mockResolvedValueOnce([]);

    const res = await DELETE(delReq(), params(VALID));
    expect(res.status).toBe(200);
    // Two deletes batched: material_attachments cleanup + course delete.
    expect(mockDbBatch).toHaveBeenCalledOnce();
    expect(mockDbDelete).toHaveBeenCalledTimes(2);
  });
});
