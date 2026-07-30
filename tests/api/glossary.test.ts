import { describe, it, expect, vi, beforeEach } from "vitest";

const { mockDbSelect, mockDbInsert, mockDbDelete } = vi.hoisted(() => ({
  mockDbSelect: vi.fn(),
  mockDbInsert: vi.fn(),
  mockDbDelete: vi.fn(),
}));

vi.mock("next-auth", () => ({ getServerSession: vi.fn() }));
vi.mock("@/lib/auth", () => ({ authOptions: {} }));
vi.mock("@/db", () => ({
  db: { select: mockDbSelect, insert: mockDbInsert, delete: mockDbDelete },
}));
vi.mock("@/db/schema", () => ({ glossaryTerms: {} }));
vi.mock("drizzle-orm", () => ({ and: vi.fn(), eq: vi.fn() }));

import { getServerSession } from "next-auth";
import { GET, POST } from "../../src/app/api/glossary/route";
import { DEFAULT_TERMS } from "../../src/lib/glossary-terms";

const mockGetServerSession = vi.mocked(getServerSession);

function makeChain(value: unknown) {
  const p = Promise.resolve(value);
  const chain: Record<string, unknown> = {};
  const self = () => chain;
  chain.from = self;
  chain.where = self;
  chain.values = self;
  chain.onConflictDoUpdate = self;
  chain.then = (r: (v: unknown) => unknown, j?: (e: unknown) => unknown) => p.then(r, j);
  return chain;
}

function req(body: unknown): Request {
  return new Request("http://localhost/api/glossary", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  mockDbSelect.mockImplementation(() => makeChain([]));
  mockDbInsert.mockImplementation(() => makeChain([]));
  mockDbDelete.mockImplementation(() => makeChain([]));
  mockGetServerSession.mockResolvedValue({ user: { email: "heidi@example.com" } });
});

describe("GET /api/glossary", () => {
  it("401s without a session", async () => {
    mockGetServerSession.mockResolvedValue(null);
    expect((await GET()).status).toBe(401);
  });

  it("returns every default term, unedited, when there are no overrides", async () => {
    const res = await GET();
    const body = await res.json();
    expect(body.terms).toHaveLength(DEFAULT_TERMS.length);
    expect(body.terms.every((t: { edited: boolean }) => !t.edited)).toBe(true);
  });

  it("merges an override over the default and flags it edited", async () => {
    mockDbSelect.mockImplementation(() =>
      makeChain([
        { termKey: "resource", definition: "Stuff for me, not the kids", updatedAt: "x" },
      ]),
    );
    const res = await GET();
    const body = await res.json();
    const resource = body.terms.find((t: { key: string }) => t.key === "resource");
    expect(resource.definition).toBe("Stuff for me, not the kids");
    expect(resource.edited).toBe(true);
    expect(resource.defaultDefinition).not.toBe(resource.definition);
    // untouched terms keep defaults
    const reading = body.terms.find((t: { key: string }) => t.key === "reading");
    expect(reading.edited).toBe(false);
  });
});

describe("POST /api/glossary", () => {
  it("401s without a session", async () => {
    mockGetServerSession.mockResolvedValue(null);
    expect((await POST(req({ termKey: "resource", definition: "x" }))).status).toBe(401);
  });

  it("400s on an unknown termKey", async () => {
    const res = await POST(req({ termKey: "not-a-term", definition: "x" }));
    expect(res.status).toBe(400);
  });

  it("413s on an oversized definition", async () => {
    const res = await POST(req({ termKey: "resource", definition: "x".repeat(2001) }));
    expect(res.status).toBe(413);
  });

  it("upserts a valid override", async () => {
    const res = await POST(req({ termKey: "resource", definition: "Stuff for me" }));
    expect(res.status).toBe(200);
    expect(mockDbInsert).toHaveBeenCalledTimes(1);
    expect(mockDbDelete).not.toHaveBeenCalled();
  });

  it("empty definition reverts to default by deleting the override", async () => {
    const res = await POST(req({ termKey: "resource", definition: "   " }));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.reverted).toBe(true);
    expect(mockDbDelete).toHaveBeenCalledTimes(1);
    expect(mockDbInsert).not.toHaveBeenCalled();
  });
});
