import { describe, it, expect, vi, beforeEach } from "vitest";

// ── Hoisted mocks ────────────────────────────────────────────────────────────
const { mockDbSelect, mockDbInsert, mockDbDelete, mockDbBatch } = vi.hoisted(() => ({
  mockDbSelect: vi.fn(),
  mockDbInsert: vi.fn(),
  mockDbDelete: vi.fn(),
  mockDbBatch: vi.fn(),
}));

vi.mock("next-auth", () => ({ getServerSession: vi.fn() }));
vi.mock("@/lib/auth", () => ({ authOptions: {} }));
vi.mock("@/db", () => ({
  db: {
    select: mockDbSelect,
    insert: mockDbInsert,
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
  curriculumEditLog: {},
}));
vi.mock("drizzle-orm", () => ({
  eq: vi.fn(),
  asc: vi.fn(),
  and: vi.fn(),
  inArray: vi.fn(),
}));

import { getServerSession } from "next-auth";
import { POST as createUnit } from "../../../../src/app/api/curriculum/editor/create-unit/route";
import { POST as deleteUnit } from "../../../../src/app/api/curriculum/editor/delete-unit/route";
import { POST as createLesson } from "../../../../src/app/api/curriculum/editor/create-lesson/route";
import { POST as deleteLesson } from "../../../../src/app/api/curriculum/editor/delete-lesson/route";

const mockGetServerSession = vi.mocked(getServerSession);
const SESSION = { user: { email: "teacher@school.edu" }, expires: "" };

function makeChain(value: unknown) {
  const p = Promise.resolve(value);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const chain: Record<string, any> = {};
  const self = () => chain;
  for (const m of ["from", "where", "orderBy", "limit", "values", "returning", "set"]) {
    chain[m] = vi.fn(self);
  }
  chain.then = (r: (v: unknown) => unknown, j?: (e: unknown) => unknown) => p.then(r, j);
  chain.catch = (j: (e: unknown) => unknown) => p.catch(j);
  chain.finally = (fn: () => void) => p.finally(fn);
  return chain;
}

const UID = {
  course: "550e8400-e29b-41d4-a716-446655440001",
  unit: "550e8400-e29b-41d4-a716-446655440002",
  lesson: "550e8400-e29b-41d4-a716-446655440003",
};

function req(url: string, body: unknown) {
  return new Request(url, { method: "POST", body: JSON.stringify(body) });
}

beforeEach(() => {
  vi.clearAllMocks();
  mockGetServerSession.mockResolvedValue(SESSION);
  mockDbDelete.mockReturnValue(makeChain(undefined));
  mockDbBatch.mockResolvedValue([]);
});

describe("POST /api/curriculum/editor/create-unit", () => {
  const URL = "http://localhost/api/curriculum/editor/create-unit";

  it("401 unauthenticated", async () => {
    mockGetServerSession.mockResolvedValueOnce(null);
    expect((await createUnit(req(URL, { courseId: UID.course }))).status).toBe(401);
  });

  it("400 when courseId is not a UUID", async () => {
    expect((await createUnit(req(URL, { courseId: "nope" }))).status).toBe(400);
    expect(mockDbSelect).not.toHaveBeenCalled();
  });

  it("403 when the caller does not own the course", async () => {
    mockDbSelect.mockReturnValueOnce(makeChain([])); // ownership → not owned
    expect((await createUnit(req(URL, { courseId: UID.course }))).status).toBe(403);
  });

  it("appends a unit with source 'human' and returns its id", async () => {
    mockDbSelect.mockReturnValueOnce(makeChain([{ id: UID.course }])); // ownership
    mockDbSelect.mockReturnValueOnce(makeChain([{ sortOrder: 1 }, { sortOrder: 2 }])); // existing units
    const insertChain = makeChain([{ id: "new-unit" }]);
    mockDbInsert.mockReturnValueOnce(insertChain); // unit insert
    mockDbInsert.mockReturnValue(makeChain(undefined)); // logEdit

    const res = await createUnit(req(URL, { courseId: UID.course }));

    expect(res.status).toBe(200);
    expect((await res.json()).unitId).toBe("new-unit");
    const values = insertChain.values.mock.calls[0][0];
    expect(values).toMatchObject({ courseId: UID.course, source: "human", sortOrder: 3 });
  });
});

describe("POST /api/curriculum/editor/delete-unit", () => {
  const URL = "http://localhost/api/curriculum/editor/delete-unit";

  it("400 when unitId is not a UUID", async () => {
    expect((await deleteUnit(req(URL, { unitId: "nope" }))).status).toBe(400);
    expect(mockDbSelect).not.toHaveBeenCalled();
  });

  it("404 when the unit does not exist", async () => {
    mockDbSelect.mockReturnValueOnce(makeChain([])); // unit lookup → none
    expect((await deleteUnit(req(URL, { unitId: UID.unit }))).status).toBe(404);
  });

  it("403 when the caller does not own the course", async () => {
    mockDbSelect.mockReturnValueOnce(makeChain([{ courseId: UID.course, title: "U" }])); // unit
    mockDbSelect.mockReturnValueOnce(makeChain([])); // ownership → not owned
    expect((await deleteUnit(req(URL, { unitId: UID.unit }))).status).toBe(403);
  });

  it("deletes via one atomic batch after clearing attachments", async () => {
    mockDbSelect.mockReturnValueOnce(makeChain([{ courseId: UID.course, title: "U" }])); // unit
    mockDbSelect.mockReturnValueOnce(makeChain([{ id: UID.course }])); // ownership
    mockDbSelect.mockReturnValueOnce(makeChain([{ id: UID.lesson }])); // child lessons
    mockDbSelect.mockReturnValueOnce(makeChain([])); // child assessments
    mockDbInsert.mockReturnValue(makeChain(undefined)); // logEdit

    const res = await deleteUnit(req(URL, { unitId: UID.unit }));

    expect(res.status).toBe(200);
    expect(mockDbBatch).toHaveBeenCalledOnce();
    // unit-attachments delete + lesson-attachments delete + unit delete = 3 statements.
    expect(mockDbBatch.mock.calls[0][0]).toHaveLength(3);
  });
});

describe("POST /api/curriculum/editor/create-lesson", () => {
  const URL = "http://localhost/api/curriculum/editor/create-lesson";

  it("400 when unitId is not a UUID", async () => {
    expect((await createLesson(req(URL, { unitId: "nope" }))).status).toBe(400);
  });

  it("403 when the caller does not own the course", async () => {
    mockDbSelect.mockReturnValueOnce(makeChain([{ courseId: UID.course }])); // unit
    mockDbSelect.mockReturnValueOnce(makeChain([])); // ownership → not owned
    expect((await createLesson(req(URL, { unitId: UID.unit }))).status).toBe(403);
  });

  it("appends a lesson with source 'human' and returns its id", async () => {
    mockDbSelect.mockReturnValueOnce(makeChain([{ courseId: UID.course }])); // unit
    mockDbSelect.mockReturnValueOnce(makeChain([{ id: UID.course }])); // ownership
    mockDbSelect.mockReturnValueOnce(makeChain([{ sortOrder: 4 }])); // existing lessons
    const insertChain = makeChain([{ id: "new-lesson" }]);
    mockDbInsert.mockReturnValueOnce(insertChain); // lesson insert
    mockDbInsert.mockReturnValue(makeChain(undefined)); // logEdit

    const res = await createLesson(req(URL, { unitId: UID.unit }));

    expect(res.status).toBe(200);
    expect((await res.json()).lessonId).toBe("new-lesson");
    expect(insertChain.values.mock.calls[0][0]).toMatchObject({
      unitId: UID.unit,
      source: "human",
      sortOrder: 5,
    });
  });
});

describe("POST /api/curriculum/editor/delete-lesson", () => {
  const URL = "http://localhost/api/curriculum/editor/delete-lesson";

  it("400 when lessonId is not a UUID", async () => {
    expect((await deleteLesson(req(URL, { lessonId: "nope" }))).status).toBe(400);
  });

  it("404 when the lesson does not exist", async () => {
    mockDbSelect.mockReturnValueOnce(makeChain([])); // lesson lookup → none
    expect((await deleteLesson(req(URL, { lessonId: UID.lesson }))).status).toBe(404);
  });

  it("403 when the caller does not own the course", async () => {
    mockDbSelect.mockReturnValueOnce(makeChain([{ unitId: UID.unit, title: "L" }])); // lesson
    mockDbSelect.mockReturnValueOnce(makeChain([{ courseId: UID.course }])); // unit
    mockDbSelect.mockReturnValueOnce(makeChain([])); // ownership → not owned
    expect((await deleteLesson(req(URL, { lessonId: UID.lesson }))).status).toBe(403);
  });

  it("deletes lesson + its attachments in one atomic batch", async () => {
    mockDbSelect.mockReturnValueOnce(makeChain([{ unitId: UID.unit, title: "L" }])); // lesson
    mockDbSelect.mockReturnValueOnce(makeChain([{ courseId: UID.course }])); // unit
    mockDbSelect.mockReturnValueOnce(makeChain([{ id: UID.course }])); // ownership
    mockDbInsert.mockReturnValue(makeChain(undefined)); // logEdit

    const res = await deleteLesson(req(URL, { lessonId: UID.lesson }));

    expect(res.status).toBe(200);
    expect(mockDbBatch).toHaveBeenCalledOnce();
    expect(mockDbBatch.mock.calls[0][0]).toHaveLength(2);
  });
});
