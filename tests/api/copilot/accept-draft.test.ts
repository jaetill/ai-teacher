import { describe, it, expect, vi, beforeEach } from "vitest";

// ── Hoisted mocks ────────────────────────────────────────────────────────
const {
  mockDbSelect,
  mockDbInsert,
  mockDbUpdate,
  mockCreateDoc,
  mockCreateSheet,
  mockCreateSlides,
} = vi.hoisted(() => ({
  mockDbSelect: vi.fn(),
  mockDbInsert: vi.fn(),
  mockDbUpdate: vi.fn(),
  mockCreateDoc: vi.fn(),
  mockCreateSheet: vi.fn(),
  mockCreateSlides: vi.fn(),
}));

vi.mock("next-auth", () => ({ getServerSession: vi.fn() }));
vi.mock("@/lib/auth", () => ({ authOptions: {} }));
vi.mock("@/lib/auth-helpers", () => ({ getAccessToken: vi.fn() }));
vi.mock("@/lib/drive", () => ({
  createDoc: mockCreateDoc,
  createSheet: mockCreateSheet,
  createSlides: mockCreateSlides,
}));
vi.mock("@/db", () => ({
  db: { select: mockDbSelect, insert: mockDbInsert, update: mockDbUpdate },
}));
vi.mock("@/db/schema", () => ({
  copilotConversations: {},
  errorEvents: {},
  courses: {},
  driveFolders: {},
  lessons: {},
  materialAttachments: {},
  materials: {},
  units: {},
  curriculumEditLog: {},
}));
vi.mock("drizzle-orm", () => ({
  eq: vi.fn(),
  and: vi.fn(),
  or: vi.fn(),
  isNull: vi.fn(),
}));

// ── Imports after mocks ──────────────────────────────────────────────────
import { getServerSession } from "next-auth";
import { getAccessToken } from "@/lib/auth-helpers";
import { POST } from "../../../src/app/api/copilot/accept-draft/route";

const mockGetServerSession = vi.mocked(getServerSession);
const mockGetAccessToken = vi.mocked(getAccessToken);

// Drizzle chain that resolves `value` when awaited at any depth.
function makeChain(value: unknown) {
  const p = Promise.resolve(value);
  const chain: Record<string, unknown> = {};
  const self = () => chain;
  chain.from = self;
  chain.where = self;
  chain.innerJoin = self;
  chain.limit = self;
  chain.values = self;
  chain.returning = self;
  chain.set = self;
  chain.then = (r: (v: unknown) => unknown, j?: (e: unknown) => unknown) => p.then(r, j);
  chain.catch = (j: (e: unknown) => unknown) => p.catch(j);
  chain.finally = (fn: () => void) => p.finally(fn);
  return chain;
}

// FIFO queues: each db.select()/db.insert() call consumes the next value.
let selectQueue: unknown[] = [];
let insertQueue: unknown[] = [];

function req(body: unknown): Request {
  return new Request("http://localhost/api/copilot/accept-draft", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: typeof body === "string" ? body : JSON.stringify(body),
  });
}

const VALID_BODY = {
  title: "Animal Farm Ch. 1–4 Quiz",
  content: "1. Who leads the rebellion?",
  materialType: "assessment",
  grade: 8,
  quarter: "Q1",
};

beforeEach(() => {
  vi.clearAllMocks();
  selectQueue = [];
  insertQueue = [];
  mockDbSelect.mockImplementation(() => makeChain(selectQueue.shift() ?? []));
  mockDbInsert.mockImplementation(() => makeChain(insertQueue.shift() ?? [{}]));
  mockDbUpdate.mockImplementation(() => makeChain([]));
  mockGetServerSession.mockResolvedValue({ user: { email: "heidi@example.com" } });
  mockGetAccessToken.mockResolvedValue("token-123");
  mockCreateDoc.mockResolvedValue({
    id: "drive-file-1",
    name: "Animal Farm Ch. 1–4 Quiz",
    webViewLink: "https://docs.google.com/document/d/drive-file-1",
  });
  mockCreateSheet.mockResolvedValue({
    id: "drive-sheet-1",
    name: "Curriculum Map",
    webViewLink: "https://docs.google.com/spreadsheets/d/drive-sheet-1",
  });
  mockCreateSlides.mockResolvedValue({
    id: "drive-slides-1",
    name: "Vocabulary Deck",
    webViewLink: "https://docs.google.com/presentation/d/drive-slides-1",
  });
});

describe("POST /api/copilot/accept-draft", () => {
  it("401s without a session", async () => {
    mockGetServerSession.mockResolvedValue(null);
    const res = await POST(req(VALID_BODY));
    expect(res.status).toBe(401);
  });

  it("401s without a Drive access token", async () => {
    mockGetAccessToken.mockResolvedValue(null);
    const res = await POST(req(VALID_BODY));
    expect(res.status).toBe(401);
  });

  it("400s on malformed JSON", async () => {
    const res = await POST(req("{nope"));
    expect(res.status).toBe(400);
  });

  it("400s when title or content is missing", async () => {
    expect((await POST(req({ content: "x" }))).status).toBe(400);
    expect((await POST(req({ title: "x" }))).status).toBe(400);
    expect((await POST(req({ title: "x", content: "   " }))).status).toBe(400);
  });

  it("413s on oversized content", async () => {
    const res = await POST(req({ ...VALID_BODY, content: "x".repeat(100_001) }));
    expect(res.status).toBe(413);
  });

  it("400s on a non-UUID conversationId", async () => {
    const res = await POST(req({ ...VALID_BODY, conversationId: "not-a-uuid" }));
    expect(res.status).toBe(400);
  });

  // ── FORMAT routing ───

  it("defaults to a Doc when no format is given", async () => {
    insertQueue = [[{ id: "11111111-1111-1111-1111-111111111111" }]];
    await POST(req(VALID_BODY));
    expect(mockCreateDoc).toHaveBeenCalledOnce();
    expect(mockCreateSheet).not.toHaveBeenCalled();
    expect(mockCreateSlides).not.toHaveBeenCalled();
  });

  it("creates a Sheet from TSV, converting to quoted CSV on the way", async () => {
    insertQueue = [[{ id: "11111111-1111-1111-1111-111111111111" }]];
    const res = await POST(
      req({
        ...VALID_BODY,
        format: "sheet",
        content: "DAY\tSTANDARDS\nDay 1\t8.RV.1.E, 8.W.1.A",
      }),
    );

    expect(res.status).toBe(200);
    expect(mockCreateDoc).not.toHaveBeenCalled();
    // The comma inside the standards cell must arrive quoted, or Drive splits
    // it into an extra column.
    expect(mockCreateSheet.mock.calls[0][2]).toBe('DAY,STANDARDS\nDay 1,"8.RV.1.E, 8.W.1.A"');
  });

  it("creates Slides from an outline, passing parsed slides through", async () => {
    insertQueue = [[{ id: "11111111-1111-1111-1111-111111111111" }]];
    const res = await POST(
      req({
        ...VALID_BODY,
        format: "slides",
        content: "# Bystander Effect\n- Define it\n- Why it matters",
      }),
    );

    expect(res.status).toBe(200);
    expect(mockCreateSlides.mock.calls[0][2]).toEqual([
      { title: "Bystander Effect", bullets: ["Define it", "Why it matters"] },
    ]);
  });

  it("400s rather than making a one-column sheet from untabbed text", async () => {
    const res = await POST(req({ ...VALID_BODY, format: "sheet", content: "no tabs here" }));
    expect(res.status).toBe(400);
    expect(mockCreateSheet).not.toHaveBeenCalled();
  });

  it("400s rather than making an empty deck from an outline with no headings", async () => {
    const res = await POST(req({ ...VALID_BODY, format: "slides", content: "- just a bullet" }));
    expect(res.status).toBe(400);
    expect(mockCreateSlides).not.toHaveBeenCalled();
  });

  it("falls back to a Doc for an unknown format rather than erroring", async () => {
    insertQueue = [[{ id: "11111111-1111-1111-1111-111111111111" }]];
    const res = await POST(req({ ...VALID_BODY, format: "xlsx" }));
    expect(res.status).toBe(200);
    expect(mockCreateDoc).toHaveBeenCalledOnce();
  });

  it("502s with the format's own name when Drive creation fails", async () => {
    mockCreateSheet.mockRejectedValue(new Error("drive exploded"));
    const res = await POST(req({ ...VALID_BODY, format: "sheet", content: "A\tB\n1\t2" }));
    expect(res.status).toBe(502);
    expect((await res.json()).error).toContain("Google Sheet");
  });

  it("creates the doc in the grade/quarter category folder and inserts an ai-sourced material", async () => {
    selectQueue = [
      [{ driveId: "folder-assessments" }], // grade_8_Q1_Assessments lookup
    ];
    insertQueue = [[{ id: "11111111-1111-1111-1111-111111111111" }]]; // materials
    const res = await POST(req(VALID_BODY));
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.materialId).toBe("11111111-1111-1111-1111-111111111111");
    expect(json.folderKey).toBe("grade_8_Q1_Assessments");
    expect(json.attached).toBeNull();
    expect(mockCreateDoc).toHaveBeenCalledWith(
      "token-123",
      VALID_BODY.title,
      VALID_BODY.content,
      "folder-assessments",
    );
    // materials insert carries source: "ai"
    const materialsChain = mockDbInsert.mock.results[0]?.value as {
      values: ReturnType<typeof vi.fn>;
    };
    expect(materialsChain).toBeTruthy();
  });

  it("falls back to the root folder when the category folder is missing", async () => {
    selectQueue = [
      [], // grade_8_Q1_Assessments — not found
      [{ driveId: "root-folder" }], // root
    ];
    insertQueue = [[{ id: "22222222-2222-2222-2222-222222222222" }]];
    const res = await POST(req(VALID_BODY));
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.folderKey).toBe("root");
    expect(mockCreateDoc).toHaveBeenCalledWith(
      "token-123",
      VALID_BODY.title,
      VALID_BODY.content,
      "root-folder",
    );
  });

  it("attaches to a lesson when the draft names one that resolves", async () => {
    selectQueue = [
      // lesson resolution (join query)
      [
        {
          id: "33333333-3333-3333-3333-333333333333",
          title: "Animal Farm: Ch. 1–4",
          quarter: "Q1",
          courseId: "44444444-4444-4444-4444-444444444444",
          grade: 8,
        },
      ],
      [{ driveId: "folder-assessments" }], // folder lookup
    ];
    insertQueue = [
      [{ id: "55555555-5555-5555-5555-555555555555" }], // materials
      [{}], // materialAttachments
      [{}], // curriculumEditLog (logEdit)
    ];
    const res = await POST(req({ ...VALID_BODY, lessonTitle: "Animal Farm: Ch. 1–4" }));
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.attached).toEqual({
      type: "lesson",
      id: "33333333-3333-3333-3333-333333333333",
      title: "Animal Farm: Ch. 1–4",
    });
  });

  it("still creates (pool only) when the named lesson does not resolve", async () => {
    selectQueue = [
      [], // lesson resolution — no match
      [{ driveId: "folder-assessments" }],
    ];
    insertQueue = [[{ id: "66666666-6666-6666-6666-666666666666" }]];
    const res = await POST(req({ ...VALID_BODY, lessonTitle: "Nope" }));
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.attached).toBeNull();
    expect(json.materialId).toBe("66666666-6666-6666-6666-666666666666");
  });

  it("502s when Drive doc creation fails, without inserting a material", async () => {
    selectQueue = [[{ driveId: "folder-assessments" }]];
    mockCreateDoc.mockRejectedValue(new Error("drive down"));
    const res = await POST(req(VALID_BODY));
    expect(res.status).toBe(502);
    // Exactly one insert now — refuse() recording the failure in error_events.
    // What must never happen is a materials row for a file that was never
    // created, which is what this test is really about.
    expect(mockDbInsert).toHaveBeenCalledTimes(1);
  });

  it("502s when Drive succeeds but returns no file id", async () => {
    // Drive resolving without an id is not the same failure as Drive throwing,
    // and it has its own reason code. A material row here would point at a
    // file that does not exist.
    selectQueue = [[{ driveId: "folder-assessments" }]];
    mockCreateDoc.mockResolvedValue({ id: undefined, webViewLink: null });

    const res = await POST(req(VALID_BODY));

    expect(res.status).toBe(502);
    expect(mockDbInsert).toHaveBeenCalledTimes(1);
  });
});

describe("ownership stamping (#537/#554)", () => {
  it("stamps the caller's ownerEmail on the materials insert", async () => {
    selectQueue = [[{ driveId: "folder-assessments" }]];
    const valuesSpy = vi.fn();
    valuesSpy.mockReturnValue({
      returning: () => Promise.resolve([{ id: "33333333-3333-3333-3333-333333333333" }]),
    });
    mockDbInsert.mockImplementationOnce(() => ({ values: valuesSpy }));

    const res = await POST(req(VALID_BODY));
    expect(res.status).toBe(200);
    expect(valuesSpy.mock.calls[0][0]).toMatchObject({
      source: "ai",
      ownerEmail: "heidi@example.com",
    });
  });
});
