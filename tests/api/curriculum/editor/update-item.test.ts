import { describe, it, expect, vi, beforeEach } from "vitest";

// Regression coverage for #631: update-item passed snake_case keys
// (sort_order, updated_at, duration_minutes, ...) to drizzle's .set(), which
// only recognizes camelCase property names and silently drops unknown keys —
// sortOrder/duration updates built an empty SET clause and 500'd. These tests
// pin the exact keys handed to .set().

const { mockDbSelect, mockDbUpdate, mockSet } = vi.hoisted(() => ({
  mockDbSelect: vi.fn(),
  mockDbUpdate: vi.fn(),
  mockSet: vi.fn(),
}));

vi.mock("next-auth", () => ({ getServerSession: vi.fn() }));
vi.mock("@/lib/auth", () => ({ authOptions: {} }));
vi.mock("@/app/api/curriculum/editor/assert-ownership", () => ({
  assertCourseOwnership: vi.fn().mockResolvedValue(null),
}));
vi.mock("@/app/api/curriculum/editor/log-edit", () => ({
  logEdit: vi.fn().mockResolvedValue(undefined),
}));
vi.mock("@/db", () => ({ db: { select: mockDbSelect, update: mockDbUpdate } }));
vi.mock("@/db/schema", () => ({ lessons: {}, assessments: {}, units: {} }));
vi.mock("drizzle-orm", () => ({ eq: vi.fn() }));

import { getServerSession } from "next-auth";
import { POST } from "../../../../src/app/api/curriculum/editor/update-item/route";

const mockGetServerSession = vi.mocked(getServerSession);

function makeSelectChain(value: unknown) {
  const p = Promise.resolve(value);
  const chain: Record<string, unknown> = {};
  const self = () => chain;
  chain.from = self;
  chain.where = self;
  chain.limit = self;
  chain.then = (r: (v: unknown) => unknown, j?: (e: unknown) => unknown) => p.then(r, j);
  return chain;
}

let selectQueue: unknown[] = [];

function req(body: unknown): Request {
  return new Request("http://localhost/api/curriculum/editor/update-item", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

const UNIT_ID = "11111111-1111-1111-1111-111111111111";
const LESSON_ID = "22222222-2222-2222-2222-222222222222";

beforeEach(() => {
  vi.clearAllMocks();
  selectQueue = [];
  mockDbSelect.mockImplementation(() => makeSelectChain(selectQueue.shift() ?? []));
  const updateChain = {
    set: mockSet.mockImplementation(() => updateChain),
    where: vi.fn().mockResolvedValue(undefined),
  };
  mockDbUpdate.mockImplementation(() => updateChain);
  mockGetServerSession.mockResolvedValue({ user: { email: "heidi@example.com" } });
});

describe("POST /api/curriculum/editor/update-item — drizzle .set() keys", () => {
  it("updates a unit's sortOrder with camelCase keys only", async () => {
    selectQueue = [
      [
        {
          id: UNIT_ID,
          title: "T",
          sortOrder: 9,
          durationWeeks: 1,
          quarter: null,
          summary: "",
          courseId: "c1",
        },
      ],
    ];
    const res = await POST(
      req({ entityType: "unit", entityId: UNIT_ID, fields: { sortOrder: 3 } }),
    );
    expect(res.status).toBe(200);
    expect(mockSet).toHaveBeenCalledTimes(1);
    const setArg = mockSet.mock.calls[0][0] as Record<string, unknown>;
    expect(Object.keys(setArg).sort()).toEqual(["sortOrder", "updatedAt"]);
    expect(setArg.sortOrder).toBe(3);
    expect(setArg.updatedAt).toBeInstanceOf(Date);
  });

  it("updates a lesson's durationMinutes with camelCase keys only", async () => {
    selectQueue = [
      [{ id: LESSON_ID, title: "L", sortOrder: 1, durationMinutes: 45, unitId: UNIT_ID }],
      [{ courseId: "c1" }],
    ];
    const res = await POST(
      req({ entityType: "lesson", entityId: LESSON_ID, fields: { durationMinutes: 30 } }),
    );
    expect(res.status).toBe(200);
    const setArg = mockSet.mock.calls[0][0] as Record<string, unknown>;
    expect(Object.keys(setArg).sort()).toEqual(["durationMinutes", "updatedAt"]);
  });

  it("updates a unit's durationWeeks and quarter with camelCase keys only", async () => {
    selectQueue = [
      [
        {
          id: UNIT_ID,
          title: "T",
          sortOrder: 1,
          durationWeeks: 1,
          quarter: null,
          summary: "",
          courseId: "c1",
        },
      ],
    ];
    const res = await POST(
      req({ entityType: "unit", entityId: UNIT_ID, fields: { durationWeeks: 8, quarter: "Q2" } }),
    );
    expect(res.status).toBe(200);
    const setArg = mockSet.mock.calls[0][0] as Record<string, unknown>;
    expect(Object.keys(setArg).sort()).toEqual(["durationWeeks", "quarter", "updatedAt"]);
  });

  it("never emits snake_case keys", async () => {
    selectQueue = [
      [
        {
          id: UNIT_ID,
          title: "T",
          sortOrder: 1,
          durationWeeks: 1,
          quarter: null,
          summary: "",
          courseId: "c1",
        },
      ],
    ];
    await POST(
      req({ entityType: "unit", entityId: UNIT_ID, fields: { sortOrder: 2, durationWeeks: 4 } }),
    );
    const setArg = mockSet.mock.calls[0][0] as Record<string, unknown>;
    for (const key of Object.keys(setArg)) {
      expect(key).not.toMatch(/_/);
    }
  });
});
