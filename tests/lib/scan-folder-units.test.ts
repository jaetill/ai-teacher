import { describe, it, expect, vi, beforeEach } from "vitest";

const { mockList } = vi.hoisted(() => ({ mockList: vi.fn() }));

vi.mock("googleapis", () => ({
  google: {
    auth: {
      OAuth2: class {
        setCredentials() {}
      },
    },
    drive: () => ({ files: { list: mockList } }),
  },
}));

import { scanFolderUnits } from "@/lib/drive";

const FOLDER = "application/vnd.google-apps.folder";
const DOC = "application/vnd.google-apps.document";

type Node = { id: string; name: string; mimeType: string };

/**
 * Serve a mocked Drive tree: parentId -> children. The route's query embeds the
 * parent id as `'<id>' in parents`, so we pull the id back out of it.
 */
function serveTree(tree: Record<string, Node[]>) {
  mockList.mockImplementation(async ({ q }: { q: string }) => {
    const parent = q.match(/'([^']+)' in parents/)?.[1] ?? "";
    return { data: { files: tree[parent] ?? [], nextPageToken: undefined } };
  });
}

describe("scanFolderUnits — which folder becomes the unit", () => {
  beforeEach(() => vi.clearAllMocks());

  // Modelled on Heidi's real Grade 6 folder, where "Letters" is a subfolder of
  // "Dash Q3". The old code passed the immediate folder name at every depth, so
  // the DEEPEST folder won: files under Dash Q3/Letters came back as unit
  // "Letters" and Dash never became a unit at all. That is the over-splitting
  // failure mode, produced by the scanner rather than by the AI.
  it("uses the first folder below the root, not the deepest nested one", async () => {
    serveTree({
      root: [
        { id: "dash", name: "Dash Q3", mimeType: FOLDER },
        { id: "plan", name: "Grade 6 Plan Overview", mimeType: DOC },
      ],
      dash: [
        { id: "d1", name: "Dash Ch 1-3", mimeType: DOC },
        { id: "letters", name: "Letters", mimeType: FOLDER },
      ],
      letters: [{ id: "l1", name: "Letter to Mitsi", mimeType: DOC }],
    });

    const files = await scanFolderUnits("token", "root");
    const unitOf = (name: string) => files.find((f) => f.name === name)?.sourceUnit;

    expect(unitOf("Dash Ch 1-3")).toBe("Dash Q3");
    // The nested file belongs to Dash, not to "Letters".
    expect(unitOf("Letter to Mitsi")).toBe("Dash Q3");
    expect(files.map((f) => f.sourceUnit)).not.toContain("Letters");
  });

  it("keeps root-level files unassigned, which is how the year plan is found", async () => {
    serveTree({
      root: [
        { id: "plan", name: "Grade 6 Plan Overview", mimeType: DOC },
        { id: "u1", name: "Refugee Q4", mimeType: FOLDER },
      ],
      u1: [{ id: "r1", name: "Refugee Ch 1", mimeType: DOC }],
    });

    const files = await scanFolderUnits("token", "root");

    expect(files.find((f) => f.name === "Grade 6 Plan Overview")?.sourceUnit).toBeNull();
    expect(files.find((f) => f.name === "Refugee Ch 1")?.sourceUnit).toBe("Refugee Q4");
  });

  it("holds the unit constant through several levels of nesting", async () => {
    serveTree({
      root: [{ id: "u", name: "Before the Ever After Q2", mimeType: FOLDER }],
      u: [{ id: "a", name: "Character Analysis - G6", mimeType: FOLDER }],
      a: [{ id: "b", name: "25-26", mimeType: FOLDER }],
      b: [{ id: "f", name: "worksheet.docx", mimeType: DOC }],
    });

    const files = await scanFolderUnits("token", "root");

    expect(files).toHaveLength(1);
    expect(files[0].sourceUnit).toBe("Before the Ever After Q2");
  });

  it("keeps sibling units distinct", async () => {
    serveTree({
      root: [
        { id: "a", name: "Unit A", mimeType: FOLDER },
        { id: "b", name: "Unit B", mimeType: FOLDER },
      ],
      a: [{ id: "a1", name: "a-file", mimeType: DOC }],
      b: [{ id: "b1", name: "b-file", mimeType: DOC }],
    });

    const files = await scanFolderUnits("token", "root");

    expect(files.find((f) => f.name === "a-file")?.sourceUnit).toBe("Unit A");
    expect(files.find((f) => f.name === "b-file")?.sourceUnit).toBe("Unit B");
  });
});
