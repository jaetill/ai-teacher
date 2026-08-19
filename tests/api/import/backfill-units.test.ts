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
  driveFolders: { driveId: {}, ownerEmail: {}, folderKey: {} },
}));
vi.mock("drizzle-orm", () => ({
  eq: vi.fn((_c, v) => ({ type: "eq", v })),
  and: vi.fn((...a) => ({ type: "and", a })),
  or: vi.fn((...a) => ({ type: "or", a })),
  isNull: vi.fn((c) => ({ type: "isNull", c })),
  inArray: vi.fn((c, v) => ({ type: "inArray", c, v })),
  like: vi.fn((c, v) => ({ type: "like", c, v })),
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

  // ── repair mode (#682) ────────────────────────────────────────────────────
  // A scanner bug wrote the DEEPEST folder name as the unit, so rows carry
  // values that are WRONG rather than missing. The default path cannot touch
  // them, and re-importing would duplicate every material and Drive file.
  describe("repair mode", () => {
    const SCAN = [
      { id: "s1", name: "dash-ch1.pdf", mimeType: "x", parents: [], sourceUnit: "Dash Q3" },
      { id: "s2", name: "letter.pdf", mimeType: "x", parents: [], sourceUnit: "Dash Q3" },
    ];

    it("leaves a disagreeing value alone when repair is not requested", async () => {
      mockScanFolderUnits.mockResolvedValueOnce(SCAN);
      mockDbSelect
        .mockReturnValueOnce(selectChain([{ driveId: "d1" }]))
        // Default mode's query filters to nulls, so a wrong-valued row never
        // reaches the loop — modelled here by returning none.
        .mockReturnValueOnce(selectChain([]));
      mockDbUpdate.mockReturnValue({ set: vi.fn() });

      const res = await POST(req({ sourceFolderId: "src-1" }));
      const body = await res.json();

      expect(body.matched).toBe(0);
      expect(body.repaired).toEqual([]);
      expect(mockDbUpdate).not.toHaveBeenCalled();
    });

    it("overwrites a disagreeing value and reports from → to", async () => {
      mockScanFolderUnits.mockResolvedValueOnce(SCAN);
      mockDbSelect.mockReturnValueOnce(selectChain([{ driveId: "d1" }])).mockReturnValueOnce(
        selectChain([
          // The real shape of the bug: a file inside Dash Q3/Letters/ stored
          // under the nested folder's name.
          { id: "m1", title: "letter.pdf", sourceUnit: "Letters" },
          { id: "m2", title: "dash-ch1.pdf", sourceUnit: "Dash Q3" }, // already right
          { id: "m3", title: "orphan.pdf", sourceUnit: null }, // fill
        ]),
      );

      const setSpy = vi.fn((_values: { sourceUnit: string }) => ({
        where: vi.fn().mockResolvedValue(undefined),
      }));
      mockDbUpdate.mockReturnValue({ set: setSpy });

      const res = await POST(req({ sourceFolderId: "src-1", repair: true }));
      const body = await res.json();

      expect(body.repaired).toEqual([{ title: "letter.pdf", from: "Letters", to: "Dash Q3" }]);
      expect(body.alreadyCorrect).toBe(1);
      // orphan.pdf is not in the scan → skipped, not filled.
      expect(body.matched).toBe(0);
      expect(body.skipped).toBe(1);
      expect(setSpy).toHaveBeenCalledTimes(1);
      expect(setSpy.mock.calls[0][0]).toEqual({ sourceUnit: "Dash Q3" });
    });

    it("never repairs an ambiguous filename", async () => {
      mockScanFolderUnits.mockResolvedValueOnce([
        { id: "s1", name: "dup.pdf", mimeType: "x", parents: [], sourceUnit: "Unit A" },
        { id: "s2", name: "dup.pdf", mimeType: "x", parents: [], sourceUnit: "Unit B" },
      ]);
      mockDbSelect
        .mockReturnValueOnce(selectChain([{ driveId: "d1" }]))
        .mockReturnValueOnce(selectChain([{ id: "m1", title: "dup.pdf", sourceUnit: "Wrong" }]));
      mockDbUpdate.mockReturnValue({ set: vi.fn() });

      const body = await (await POST(req({ sourceFolderId: "src-1", repair: true }))).json();

      expect(body.repaired).toEqual([]);
      expect(body.skipped).toBe(1);
      expect(mockDbUpdate).not.toHaveBeenCalled();
    });

    it("rejects a grade that is not a plain integer in range", async () => {
      for (const grade of [0, 13, 1.5, "6"]) {
        const res = await POST(req({ sourceFolderId: "src-1", repair: true, grade }));
        expect(res.status).toBe(400);
      }
      expect(mockScanFolderUnits).not.toHaveBeenCalled();
    });
  });
});
