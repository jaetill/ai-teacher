import { describe, it, expect, vi, beforeEach } from "vitest";

// ── Hoisted mocks ────────────────────────────────────────────────────────────
const { mockDbSelect, mockDbUpdate, mockScanFolderUnits } = vi.hoisted(() => ({
  mockDbSelect: vi.fn(),
  mockDbUpdate: vi.fn(),
  mockScanFolderUnits: vi.fn(),
}));

vi.mock("next-auth", () => ({ getServerSession: vi.fn() }));
vi.mock("next-auth/jwt", () => ({ getToken: vi.fn() }));
vi.mock("@/lib/auth", () => ({ authOptions: {} }));
vi.mock("@/db", () => ({ db: { select: mockDbSelect, update: mockDbUpdate } }));
vi.mock("@/db/schema", () => ({
  materials: { id: {}, title: {}, sourceUnit: {}, driveFolderId: {} },
  driveFolders: { driveId: {}, ownerEmail: {} },
}));
vi.mock("drizzle-orm", () => ({
  eq: vi.fn((_c, v) => ({ type: "eq", v })),
  and: vi.fn((...a) => ({ type: "and", a })),
  or: vi.fn((...a) => ({ type: "or", a })),
  isNull: vi.fn((c) => ({ type: "isNull", c })),
  inArray: vi.fn((c, v) => ({ type: "inArray", c, v })),
}));
vi.mock("@/lib/drive", () => ({ scanFolderUnits: mockScanFolderUnits }));

import { getServerSession } from "next-auth";
import { getToken } from "next-auth/jwt";
import { POST } from "../../../src/app/api/import/backfill-units/route";

const mockGetServerSession = vi.mocked(getServerSession);
const mockGetToken = vi.mocked(getToken);

function selectChain(rows: unknown) {
  const p = Promise.resolve(rows);
  const chain: Record<string, unknown> = {};
  const self = () => chain;
  chain.from = self;
  chain.where = self;
  chain.then = (r: (v: unknown) => unknown, j?: (e: unknown) => unknown) => p.then(r, j);
  chain.catch = (j: (e: unknown) => unknown) => p.catch(j);
  chain.finally = (fn: () => void) => p.finally(fn);
  return chain;
}

function req(body: object = { sourceFolderId: "src-1" }) {
  return { json: () => Promise.resolve(body) } as unknown as Request;
}

beforeEach(() => {
  vi.clearAllMocks();
  mockGetToken.mockResolvedValue({ accessToken: "tok" });
  mockGetServerSession.mockResolvedValue({ user: { email: "teacher@school.edu" } });
});

describe("POST /api/import/backfill-units", () => {
  it("401 without an access token", async () => {
    mockGetToken.mockResolvedValueOnce(null);
    const res = await POST(req());
    expect(res.status).toBe(401);
  });

  it("401 when session has no email", async () => {
    mockGetServerSession.mockResolvedValueOnce({ user: {} });
    const res = await POST(req());
    expect(res.status).toBe(401);
  });

  it("400 when sourceFolderId is missing", async () => {
    const res = await POST(req({}));
    expect(res.status).toBe(400);
  });

  it("fills only null source_unit by filename, skipping ambiguous and unmatched", async () => {
    mockScanFolderUnits.mockResolvedValueOnce([
      { id: "s1", name: "giver-ch1.pdf", mimeType: "x", parents: [], sourceUnit: "The Giver" },
      {
        id: "s2",
        name: "outsiders-1.pdf",
        mimeType: "x",
        parents: [],
        sourceUnit: "The Outsiders",
      },
      { id: "s3", name: "dup.pdf", mimeType: "x", parents: [], sourceUnit: "Unit A" },
      { id: "s4", name: "dup.pdf", mimeType: "x", parents: [], sourceUnit: "Unit B" }, // ambiguous
      { id: "s5", name: "root.pdf", mimeType: "x", parents: [], sourceUnit: null }, // root, no unit
    ]);
    // 1st select = owner's drive folders; 2nd select = candidate materials.
    mockDbSelect.mockReturnValueOnce(selectChain([{ driveId: "d1" }])).mockReturnValueOnce(
      selectChain([
        { id: "m1", title: "giver-ch1.pdf" },
        { id: "m2", title: "Outsiders-1.pdf" }, // case-insensitive match
        { id: "m3", title: "dup.pdf" }, // ambiguous → skip
        { id: "m4", title: "unmatched.pdf" }, // no source match → skip
      ]),
    );

    const setSpy = vi.fn((_values: { sourceUnit: string }) => ({
      where: vi.fn().mockResolvedValue(undefined),
    }));
    mockDbUpdate.mockReturnValue({ set: setSpy });

    const res = await POST(req());

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toMatchObject({ matched: 2, skipped: 2, units: 2 });
    // Only the two confident matches were written, with their units.
    expect(setSpy).toHaveBeenCalledTimes(2);
    const written = setSpy.mock.calls.map((c) => c[0].sourceUnit).sort();
    expect(written).toEqual(["The Giver", "The Outsiders"]);
  });

  it("returns zero when the owner has no drive folders", async () => {
    mockScanFolderUnits.mockResolvedValueOnce([
      { id: "s1", name: "a.pdf", mimeType: "x", parents: [], sourceUnit: "U1" },
    ]);
    mockDbSelect.mockReturnValueOnce(selectChain([])); // no owner folders
    const res = await POST(req());
    expect(res.status).toBe(200);
    expect((await res.json()).matched).toBe(0);
    expect(mockDbUpdate).not.toHaveBeenCalled();
  });
});
