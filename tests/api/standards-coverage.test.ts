import { describe, it, expect, vi, beforeEach } from "vitest";

const { mockDbSelect } = vi.hoisted(() => ({ mockDbSelect: vi.fn() }));

vi.mock("next-auth", () => ({ getServerSession: vi.fn() }));
vi.mock("@/lib/auth", () => ({ authOptions: {} }));
vi.mock("@/db", () => ({ db: { select: mockDbSelect } }));
vi.mock("@/db/schema", () => ({
  courses: {},
  units: {},
  lessons: {},
  standards: {},
  unitStandards: {},
  lessonStandards: {},
}));
vi.mock("drizzle-orm", () => ({ asc: vi.fn(), eq: vi.fn(), inArray: vi.fn() }));

import { getServerSession } from "next-auth";
import { GET } from "../../src/app/api/standards/coverage/route";

const mockGetServerSession = vi.mocked(getServerSession);

function makeChain(value: unknown) {
  const p = Promise.resolve(value);
  const chain: Record<string, unknown> = {};
  const self = () => chain;
  chain.from = self;
  chain.where = self;
  chain.orderBy = self;
  chain.then = (r: (v: unknown) => unknown, j?: (e: unknown) => unknown) => p.then(r, j);
  return chain;
}

let selectQueue: unknown[] = [];

beforeEach(() => {
  vi.clearAllMocks();
  selectQueue = [];
  mockDbSelect.mockImplementation(() => makeChain(selectQueue.shift() ?? []));
  mockGetServerSession.mockResolvedValue({ user: { email: "heidi@example.com" } });
});

describe("GET /api/standards/coverage", () => {
  it("401s without a session", async () => {
    mockGetServerSession.mockResolvedValue(null);
    const res = await GET();
    expect(res.status).toBe(401);
  });

  it("marks standards covered via unit and lesson links, uncovered otherwise", async () => {
    selectQueue = [
      [{ id: "c1", grade: 7, title: "G7 ELA" }], // courses
      [{ id: "u1", courseId: "c1", title: "The Giver", quarter: "Q1" }], // units
      [{ id: "l1", unitId: "u1", title: "Ch 1-4" }], // lessons
      [{ standardId: "7.RL.1", unitId: "u1" }], // unit links
      [{ standardId: "7.W.2", lessonId: "l1", coverageType: "practiced" }], // lesson links
      [
        {
          id: "7.RL.1",
          grade: 7,
          strandCode: "RL",
          strandName: "Reading",
          description: "d1",
          parentId: null,
        },
        {
          id: "7.W.2",
          grade: 7,
          strandCode: "W",
          strandName: "Writing",
          description: "d2",
          parentId: null,
        },
        {
          id: "7.C.3",
          grade: 7,
          strandCode: "C",
          strandName: "Comm",
          description: "d3",
          parentId: null,
        },
      ], // standards
    ];
    const res = await GET();
    expect(res.status).toBe(200);
    const body = await res.json();
    const byId = Object.fromEntries(body.standards.map((s: { id: string }) => [s.id, s]));
    expect(byId["7.RL.1"].covered).toBe(true);
    expect(byId["7.RL.1"].units[0]).toMatchObject({ unitTitle: "The Giver", grade: 7 });
    expect(byId["7.W.2"].covered).toBe(true);
    expect(byId["7.W.2"].lessons[0]).toMatchObject({
      lessonTitle: "Ch 1-4",
      unitTitle: "The Giver",
      coverageType: "practiced",
    });
    expect(byId["7.C.3"].covered).toBe(false);
  });

  it("returns all standards uncovered when the owner has no courses", async () => {
    selectQueue = [
      [], // courses
      [
        {
          id: "7.RL.1",
          grade: 7,
          strandCode: "RL",
          strandName: "Reading",
          description: "d",
          parentId: null,
        },
      ], // standards
    ];
    const res = await GET();
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.standards).toHaveLength(1);
    expect(body.standards[0].covered).toBe(false);
  });
});
