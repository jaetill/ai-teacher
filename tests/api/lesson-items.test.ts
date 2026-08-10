import { describe, it, expect, vi, beforeEach } from "vitest";

// POST /api/lessons/[id]/items (#679). The contract under test: owner scoping,
// passage resolution, and above all that a fabricated item never escapes the
// route even when the model returns one.

const { mockDbSelect, mockMessagesCreate, mockFetchDriveText, mockGetAccessToken } = vi.hoisted(
  () => ({
    mockDbSelect: vi.fn(),
    mockMessagesCreate: vi.fn(),
    mockFetchDriveText: vi.fn(),
    mockGetAccessToken: vi.fn(),
  }),
);

vi.mock("next-auth", () => ({ getServerSession: vi.fn() }));
vi.mock("@/lib/auth", () => ({ authOptions: {} }));
vi.mock("@/lib/auth-helpers", () => ({ getAccessToken: mockGetAccessToken }));
vi.mock("@/db", () => ({ db: { select: mockDbSelect } }));
vi.mock("@/db/schema", () => ({
  lessons: { id: {}, unitId: {}, title: {} },
  units: { id: {}, courseId: {} },
  courses: { id: {}, grade: {}, ownerEmail: {} },
  materials: {
    id: {},
    title: {},
    driveFileId: {},
    driveMimeType: {},
    inlineContent: {},
    ownerEmail: {},
  },
  materialAttachments: { materialId: {}, attachableType: {}, attachableId: {} },
}));
vi.mock("drizzle-orm", () => ({ and: vi.fn(), eq: vi.fn(), or: vi.fn(), isNull: vi.fn() }));
vi.mock("@/lib/material-scope", () => ({ ownedMaterials: vi.fn() }));
vi.mock("@/lib/anthropic", () => ({
  getAnthropic: () => ({ messages: { create: mockMessagesCreate } }),
}));
vi.mock("@/lib/rate-limit", () => ({ checkAiRateLimit: vi.fn().mockResolvedValue(null) }));
vi.mock("@/lib/drive-text", () => ({
  fetchDriveText: mockFetchDriveText,
  isExtractable: (m: string | null) => m === "application/vnd.google-apps.document",
}));

import { getServerSession } from "next-auth";
import { POST } from "../../src/app/api/lessons/[id]/items/route";

const mockGetServerSession = vi.mocked(getServerSession);
const SESSION = { user: { email: "heidi@example.com" }, expires: "" };
const LESSON_ID = "550e8400-e29b-41d4-a716-446655440333";
const MATERIAL_ID = "550e8400-e29b-41d4-a716-446655440444";

const PASSAGE =
  "The clerk watched her from behind the counter, saying nothing. Mitsi kept her eyes on the shelf and counted out the coins twice, though she had counted them at home. Outside, the wind pushed against the glass.";

function chain(rows: unknown) {
  const p = Promise.resolve(rows);
  const c: Record<string, unknown> = {};
  const self = () => c;
  for (const m of ["from", "innerJoin", "where", "limit", "orderBy"]) c[m] = vi.fn(self);
  c.then = (r: (v: unknown) => unknown, j?: (e: unknown) => unknown) => p.then(r, j);
  return c;
}

const req = (body: unknown) =>
  new Request(`http://localhost/api/lessons/${LESSON_ID}/items`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
const ctx = (id = LESSON_ID) => ({ params: Promise.resolve({ id }) });

const aiReturns = (items: unknown) =>
  mockMessagesCreate.mockResolvedValueOnce({
    content: [{ type: "text", text: JSON.stringify(items) }],
  });

const goodItem = {
  type: "inferential",
  question: "What does Mitsi's behaviour suggest?",
  choices: ["She is nervous", "She is bored", "She is angry", "She is asleep"],
  answerIndex: 0,
  evidence: "counted out the coins twice",
};

beforeEach(() => {
  vi.clearAllMocks();
  mockGetServerSession.mockResolvedValue(SESSION);
  // Default: the lesson resolves through an owned course.
  mockDbSelect.mockImplementation(() => chain([{ grade: 7, lessonTitle: "Dash: Ch. 4-6" }]));
  mockGetAccessToken.mockResolvedValue("token");
});

describe("auth and validation", () => {
  it("401s without a session", async () => {
    mockGetServerSession.mockResolvedValueOnce(null);
    const res = await POST(req({ passage: PASSAGE, types: ["tone"] }), ctx());
    expect(res.status).toBe(401);
  });

  it("400s on a non-UUID lesson id", async () => {
    const res = await POST(req({ passage: PASSAGE, types: ["tone"] }), ctx("nope"));
    expect(res.status).toBe(400);
  });

  it("400s when no question type was chosen", async () => {
    const res = await POST(req({ passage: PASSAGE, types: [] }), ctx());
    expect(res.status).toBe(400);
    expect((await res.json()).error).toMatch(/at least one question type/i);
  });

  it("ignores unknown question types rather than trusting them", async () => {
    const res = await POST(req({ passage: PASSAGE, types: ["essay", "sql"] }), ctx());
    expect(res.status).toBe(400);
  });

  it("404s when the lesson is not the caller's", async () => {
    mockDbSelect.mockImplementationOnce(() => chain([]));
    const res = await POST(req({ passage: PASSAGE, types: ["tone"] }), ctx());
    expect(res.status).toBe(404);
    expect(mockMessagesCreate).not.toHaveBeenCalled();
  });

  it("400s on a passage too short to ground anything", async () => {
    const res = await POST(req({ passage: "Too short.", types: ["tone"] }), ctx());
    expect(res.status).toBe(400);
    expect(mockMessagesCreate).not.toHaveBeenCalled();
  });

  it("400s when no passage and no material were given", async () => {
    const res = await POST(req({ types: ["tone"] }), ctx());
    expect(res.status).toBe(400);
    expect((await res.json()).error).toMatch(/pick a material or paste/i);
  });
});

describe("grounding contract", () => {
  it("returns items whose evidence is in the passage", async () => {
    aiReturns([goodItem]);
    const res = await POST(req({ passage: PASSAGE, types: ["inferential"] }), ctx());
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.items).toHaveLength(1);
    expect(body.items[0].evidence).toBe("counted out the coins twice");
  });

  it("drops a fabricated item and reports it rather than shipping it", async () => {
    aiReturns([
      goodItem,
      { ...goodItem, question: "Who took her father?", evidence: "her father was taken at dawn" },
    ]);
    const res = await POST(req({ passage: PASSAGE, types: ["inferential"] }), ctx());
    const body = await res.json();
    expect(body.items).toHaveLength(1);
    expect(body.dropped).toHaveLength(1);
    expect(body.dropped[0].reason).toMatch(/not in the passage/i);
  });

  it("422s when every item was fabricated — no partial silence", async () => {
    aiReturns([{ ...goodItem, evidence: "nothing like this appears anywhere" }]);
    const res = await POST(req({ passage: PASSAGE, types: ["inferential"] }), ctx());
    expect(res.status).toBe(422);
    expect((await res.json()).dropped).toHaveLength(1);
  });

  it("502s cleanly when the model call throws", async () => {
    mockMessagesCreate.mockRejectedValueOnce(new Error("upstream"));
    const res = await POST(req({ passage: PASSAGE, types: ["tone"] }), ctx());
    expect(res.status).toBe(502);
  });

  it("returns paste-ready text with and without the answer key", async () => {
    aiReturns([goodItem]);
    const body = await (await POST(req({ passage: PASSAGE, types: ["tone"] }), ctx())).json();
    expect(body.plainText).toContain("ANSWER KEY");
    expect(body.studentText).not.toContain("ANSWER KEY");
    expect(body.plainText).toContain("Dash: Ch. 4-6");
  });
});

describe("passage from an attached material", () => {
  const lessonThen = (material: unknown) => {
    mockDbSelect
      .mockImplementationOnce(() => chain([{ grade: 7, lessonTitle: "Dash: Ch. 4-6" }]))
      .mockImplementationOnce(() => chain(material ? [material] : []));
  };

  it("404s when the material is not attached to this lesson", async () => {
    lessonThen(null);
    const res = await POST(req({ materialId: MATERIAL_ID, types: ["tone"] }), ctx());
    expect(res.status).toBe(404);
    expect(mockMessagesCreate).not.toHaveBeenCalled();
  });

  it("reads a Google Doc's text and grounds items in it", async () => {
    lessonThen({
      id: MATERIAL_ID,
      title: "Dash excerpt.docx",
      driveFileId: "drive-1",
      driveMimeType: "application/vnd.google-apps.document",
      inlineContent: null,
    });
    mockFetchDriveText.mockResolvedValueOnce(PASSAGE);
    aiReturns([goodItem]);

    const res = await POST(req({ materialId: MATERIAL_ID, types: ["tone"] }), ctx());

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.sourceTitle).toBe("Dash excerpt.docx");
    expect(mockFetchDriveText).toHaveBeenCalledWith("token", "drive-1", expect.any(String));
  });

  it("422s with a useful message for a file type that has no text", async () => {
    lessonThen({
      id: MATERIAL_ID,
      title: "Holocaust Slides.pptx",
      driveFileId: "drive-2",
      driveMimeType: "application/vnd.google-apps.presentation",
      inlineContent: null,
    });
    const res = await POST(req({ materialId: MATERIAL_ID, types: ["tone"] }), ctx());
    expect(res.status).toBe(422);
    expect((await res.json()).error).toMatch(/paste the passage instead/i);
  });

  it("502s when Drive refuses the file", async () => {
    lessonThen({
      id: MATERIAL_ID,
      title: "Dash excerpt",
      driveFileId: "drive-3",
      driveMimeType: "application/vnd.google-apps.document",
      inlineContent: null,
    });
    mockFetchDriveText.mockRejectedValueOnce(new Error("export cap"));
    const res = await POST(req({ materialId: MATERIAL_ID, types: ["tone"] }), ctx());
    expect(res.status).toBe(502);
  });

  it("prefers stored inline content over a Drive round-trip", async () => {
    lessonThen({
      id: MATERIAL_ID,
      title: "Pasted excerpt",
      driveFileId: null,
      driveMimeType: null,
      inlineContent: PASSAGE,
    });
    aiReturns([goodItem]);
    const res = await POST(req({ materialId: MATERIAL_ID, types: ["tone"] }), ctx());
    expect(res.status).toBe(200);
    expect(mockFetchDriveText).not.toHaveBeenCalled();
  });
});
