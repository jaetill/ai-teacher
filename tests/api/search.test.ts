import { describe, it, expect, vi, beforeEach } from "vitest";

const { mockDbSelect } = vi.hoisted(() => ({ mockDbSelect: vi.fn() }));

vi.mock("next-auth", () => ({ getServerSession: vi.fn() }));
vi.mock("@/lib/auth", () => ({ authOptions: {} }));
vi.mock("@/db", () => ({ db: { select: mockDbSelect } }));
vi.mock("@/db/schema", () => ({
  courses: {},
  units: {},
  lessons: {},
  materials: {},
  materialAttachments: {},
}));
vi.mock("drizzle-orm", () => ({
  asc: vi.fn(),
  eq: vi.fn(),
  inArray: vi.fn(),
  and: vi.fn(),
  or: vi.fn(),
  isNull: vi.fn(),
}));

import { getServerSession } from "next-auth";
import { GET } from "../../src/app/api/search/route";

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

const FIXTURE = () => [
  [{ id: "c1", grade: 7 }], // courses
  [
    {
      id: "u1",
      courseId: "c1",
      title: "The Giver 26-27",
      summary: "dystopian texts incl Harrison Bergeron",
      quarter: "Q1",
    },
    {
      id: "u2",
      courseId: "c1",
      title: "The Outsiders 26-27",
      summary: "archetypes",
      quarter: "Q3",
    },
  ], // units
  [
    { id: "l1", unitId: "u1", title: "Harrison Bergeron close read" },
    { id: "l2", unitId: "u2", title: "Ch 1-4" },
  ], // lessons
  [
    { materialId: "m1", attachableType: "lesson", attachableId: "l1" },
    { materialId: "m2", attachableType: "unit", attachableId: "u2" },
  ], // attachments
  [
    {
      id: "m1",
      title: "Harrison Bergeron excerpt stations",
      description: null,
      materialType: "activity",
      driveWebUrl: "https://drive/x",
    },
    {
      id: "m2",
      title: "Outsiders vocab",
      description: null,
      materialType: "resource",
      driveWebUrl: null,
    },
  ], // materials
];

function req(q: string): Request {
  return new Request(`http://localhost/api/search?q=${encodeURIComponent(q)}`);
}

beforeEach(() => {
  vi.clearAllMocks();
  selectQueue = [];
  mockDbSelect.mockImplementation(() => makeChain(selectQueue.shift() ?? []));
  mockGetServerSession.mockResolvedValue({ user: { email: "heidi@example.com" } });
});

describe("GET /api/search", () => {
  it("401s without a session", async () => {
    mockGetServerSession.mockResolvedValue(null);
    expect((await GET(req("giver"))).status).toBe(401);
  });

  it("400s on a too-short query", async () => {
    expect((await GET(req("g"))).status).toBe(400);
  });

  it("finds case-insensitive matches across units, lessons, and materials", async () => {
    selectQueue = FIXTURE();
    const res = await GET(req("harrison bergeron"));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.units.map((u: { id: string }) => u.id)).toEqual(["u1"]); // summary match
    expect(body.lessons.map((l: { id: string }) => l.id)).toEqual(["l1"]);
    expect(body.lessons[0]).toMatchObject({ unitTitle: "The Giver 26-27", grade: 7 });
    expect(body.materials.map((m: { id: string }) => m.id)).toEqual(["m1"]);
    // material attached to a lesson resolves to that lesson's unit for linking
    expect(body.materials[0].unitId).toBe("u1");
  });

  it("returns empty arrays when nothing matches", async () => {
    selectQueue = FIXTURE();
    const res = await GET(req("zzzznope"));
    const body = await res.json();
    expect(body.units).toEqual([]);
    expect(body.lessons).toEqual([]);
    expect(body.materials).toEqual([]);
  });

  it("resolves unit-attached materials to their unit", async () => {
    selectQueue = FIXTURE();
    const res = await GET(req("outsiders"));
    const body = await res.json();
    expect(body.materials.map((m: { id: string }) => m.id)).toEqual(["m2"]);
    expect(body.materials[0].unitId).toBe("u2");
  });
});
