import { describe, it, expect, vi, beforeEach } from "vitest";

// /api/lesson-templates (#647). Owner scoping is the load-bearing part: a
// builtin has owner_email NULL and must be unreachable for writes even by a
// caller who knows its id.

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
  lessonTemplates: {
    id: {},
    ownerEmail: {},
    name: {},
    description: {},
    fields: {},
    isDefault: {},
    source: {},
    updatedAt: {},
  },
  courses: { id: {}, lessonTemplateId: {} },
  lessons: { id: {}, templateId: {} },
}));
vi.mock("drizzle-orm", () => ({
  and: vi.fn(),
  eq: vi.fn(),
  or: vi.fn(),
  ne: vi.fn(),
  isNull: vi.fn(),
}));

import { getServerSession } from "next-auth";
import { GET, POST, PATCH, DELETE } from "../../src/app/api/lesson-templates/route";

const mockGetServerSession = vi.mocked(getServerSession);
const SESSION = { user: { email: "heidi@example.com" }, expires: "" };
const TEMPLATE_ID = "550e8400-e29b-41d4-a716-446655440222";

function chain(rows: unknown) {
  const p = Promise.resolve(rows);
  const c: Record<string, unknown> = {};
  const self = () => c;
  for (const m of ["from", "where", "limit", "values", "returning", "set", "orderBy"])
    c[m] = vi.fn(self);
  c.then = (r: (v: unknown) => unknown, j?: (e: unknown) => unknown) => p.then(r, j);
  return c;
}

const body = (method: string, b: unknown) =>
  new Request("http://localhost/api/lesson-templates", {
    method,
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(b),
  });
const del = (id: string) =>
  new Request(`http://localhost/api/lesson-templates?id=${id}`, { method: "DELETE" });

const FIELDS = [{ label: "Bell Ringer", type: "text", required: true }];

beforeEach(() => {
  vi.clearAllMocks();
  mockGetServerSession.mockResolvedValue(SESSION);
  mockDbSelect.mockImplementation(() => chain([]));
  mockDbInsert.mockImplementation(() => chain([{ id: TEMPLATE_ID }]));
  mockDbDelete.mockImplementation(() => chain([]));
  mockDbUpdate.mockImplementation(() => chain([]));
});

describe("GET /api/lesson-templates", () => {
  it("401s without a session", async () => {
    mockGetServerSession.mockResolvedValueOnce(null);
    expect((await GET()).status).toBe(401);
  });

  it("always returns the Classic builtin so there is a fallback to show", async () => {
    const res = await GET();
    const data = await res.json();
    expect(data.builtin.name).toBe("Classic");
    expect(data.builtin.fields[0].key).toBe("activities");
  });
});

describe("POST /api/lesson-templates", () => {
  it("401s without a session", async () => {
    mockGetServerSession.mockResolvedValueOnce(null);
    expect((await POST(body("POST", { name: "x", fields: FIELDS }))).status).toBe(401);
  });

  it("400s on a blank name", async () => {
    expect((await POST(body("POST", { name: "  ", fields: FIELDS }))).status).toBe(400);
    expect(mockDbInsert).not.toHaveBeenCalled();
  });

  it("400s when the fields fail validation", async () => {
    const res = await POST(body("POST", { name: "Reading Day", fields: [] }));
    expect(res.status).toBe(400);
    expect((await res.json()).error).toMatch(/at least one field/i);
    expect(mockDbInsert).not.toHaveBeenCalled();
  });

  it("creates a template with normalized fields", async () => {
    const valuesSpy = vi.fn().mockReturnValue(chain([{ id: TEMPLATE_ID }]));
    mockDbInsert.mockImplementationOnce(() => ({ values: valuesSpy }));

    const res = await POST(body("POST", { name: "Reading Day", fields: FIELDS }));

    expect(res.status).toBe(200);
    const inserted = valuesSpy.mock.calls[0][0];
    expect(inserted.ownerEmail).toBe("heidi@example.com");
    // Key derived from the label, required carried through.
    expect(inserted.fields[0]).toMatchObject({ key: "bell_ringer", required: true });
  });

  it("clears other defaults when the new template claims the flag", async () => {
    await POST(body("POST", { name: "Reading Day", fields: FIELDS, isDefault: true }));
    expect(mockDbUpdate).toHaveBeenCalledTimes(1);
  });

  it("does not touch other templates when it is not the default", async () => {
    await POST(body("POST", { name: "Reading Day", fields: FIELDS }));
    expect(mockDbUpdate).not.toHaveBeenCalled();
  });
});

describe("PATCH /api/lesson-templates", () => {
  it("400s on a non-UUID id", async () => {
    expect((await PATCH(body("PATCH", { id: "nope", name: "x" }))).status).toBe(400);
  });

  it("400s when nothing to update was sent", async () => {
    expect((await PATCH(body("PATCH", { id: TEMPLATE_ID }))).status).toBe(400);
  });

  it("404s for a template that is not the caller's — including a builtin", async () => {
    // Builtins have owner_email NULL, so the owner-scoped lookup misses them.
    const res = await PATCH(body("PATCH", { id: TEMPLATE_ID, name: "Hijacked" }));
    expect(res.status).toBe(404);
    expect(mockDbUpdate).not.toHaveBeenCalled();
  });

  it("saves an owned template", async () => {
    mockDbSelect.mockImplementationOnce(() => chain([{ id: TEMPLATE_ID }]));
    const setSpy = vi.fn().mockReturnValue(chain([]));
    mockDbUpdate.mockImplementationOnce(() => ({ set: setSpy }));

    const res = await PATCH(body("PATCH", { id: TEMPLATE_ID, name: "Seminar Day" }));

    expect(res.status).toBe(200);
    expect(setSpy.mock.calls[0][0].name).toBe("Seminar Day");
  });

  it("rejects invalid fields before touching the database", async () => {
    // No select mock queued on purpose: the route must reject on validation
    // before it ever looks the template up.
    const res = await PATCH(
      body("PATCH", { id: TEMPLATE_ID, fields: [{ label: "x", type: "checkbox" }] }),
    );
    expect(res.status).toBe(400);
    expect(mockDbSelect).not.toHaveBeenCalled();
    expect(mockDbUpdate).not.toHaveBeenCalled();
  });
});

describe("DELETE /api/lesson-templates", () => {
  it("400s on a non-UUID id", async () => {
    expect((await DELETE(del("nope"))).status).toBe(400);
  });

  it("404s when the template is not the caller's", async () => {
    expect((await DELETE(del(TEMPLATE_ID))).status).toBe(404);
    expect(mockDbDelete).not.toHaveBeenCalled();
  });

  it("detaches courses and lessons before deleting so nothing dangles", async () => {
    mockDbSelect.mockImplementationOnce(() => chain([{ id: TEMPLATE_ID }]));
    const res = await DELETE(del(TEMPLATE_ID));
    expect(res.status).toBe(200);
    // One update for courses, one for lessons, then the delete.
    expect(mockDbUpdate).toHaveBeenCalledTimes(2);
    expect(mockDbDelete).toHaveBeenCalledTimes(1);
  });
});
