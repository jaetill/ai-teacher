import { describe, it, expect, vi, beforeEach } from "vitest";

const { mockList, mockGet } = vi.hoisted(() => ({
  mockList: vi.fn(),
  mockGet: vi.fn(),
}));

vi.mock("googleapis", () => ({
  google: {
    auth: {
      OAuth2: class {
        setCredentials() {}
      },
    },
    drive: () => ({ files: { list: mockList, get: mockGet } }),
  },
}));

import { scanTree, type ScannedNode } from "@/lib/drive";

const FOLDER = "application/vnd.google-apps.folder";
const DOC = "application/vnd.google-apps.document";

type Node = { id: string; name: string; mimeType: string };

/** Serve a mocked Drive tree: parentId -> children, plus a root files.get. */
function serveTree(tree: Record<string, Node[]>, root: Node) {
  mockGet.mockResolvedValue({ data: root });
  mockList.mockImplementation(async ({ q }: { q: string }) => {
    const parent = q.match(/'([^']+)' in parents/)?.[1] ?? "";
    return { data: { files: tree[parent] ?? [], nextPageToken: undefined } };
  });
}

/** Folder names at each depth, for compact assertions. */
function shape(node: ScannedNode): unknown {
  return node.isFolder ? { [node.name]: node.children.map(shape) } : node.name;
}

describe("scanTree — reports shape, interprets nothing", () => {
  beforeEach(() => vi.clearAllMocks());

  it("returns the subtree as Drive has it, folders and files intact", async () => {
    serveTree(
      {
        root: [
          { id: "dash", name: "Dash Q3", mimeType: FOLDER },
          { id: "plan", name: "Grade 6 Plan Overview", mimeType: DOC },
        ],
        dash: [
          { id: "d1", name: "Dash Ch 1-3", mimeType: DOC },
          { id: "letters", name: "Letters", mimeType: FOLDER },
        ],
        letters: [{ id: "l1", name: "Letter to Mitsi", mimeType: DOC }],
      },
      { id: "root", name: "Grade 6", mimeType: FOLDER },
    );

    const tree = await scanTree("token", "root");

    expect(shape(tree)).toEqual({
      "Grade 6": [
        { "Dash Q3": ["Dash Ch 1-3", { Letters: ["Letter to Mitsi"] }] },
        "Grade 6 Plan Overview",
      ],
    });
  });

  it("assigns no unit, quarter or meaning of any kind", async () => {
    serveTree(
      { root: [{ id: "u", name: "Q1", mimeType: FOLDER }], u: [] },
      { id: "root", name: "Grade 7", mimeType: FOLDER },
    );

    const tree = await scanTree("token", "root");

    // The only keys a node carries are structural. Anything semantic would be
    // the scanner guessing again, which is exactly what #682 was.
    expect(Object.keys(tree).sort()).toEqual(["children", "id", "isFolder", "mimeType", "name"]);
  });

  it("follows pagination", async () => {
    mockGet.mockResolvedValue({ data: { id: "root", name: "R", mimeType: FOLDER } });
    mockList
      .mockResolvedValueOnce({
        data: { files: [{ id: "a", name: "a.docx", mimeType: DOC }], nextPageToken: "p2" },
      })
      .mockResolvedValueOnce({
        data: { files: [{ id: "b", name: "b.docx", mimeType: DOC }] },
      });

    const tree = await scanTree("token", "root");

    expect(tree.children.map((c) => c.name)).toEqual(["a.docx", "b.docx"]);
    expect(mockList).toHaveBeenCalledTimes(2);
  });

  it("stops at maxDepth instead of recursing forever", async () => {
    serveTree(
      {
        root: [{ id: "l1", name: "one", mimeType: FOLDER }],
        l1: [{ id: "l2", name: "two", mimeType: FOLDER }],
        l2: [{ id: "l3", name: "three", mimeType: FOLDER }],
      },
      { id: "root", name: "R", mimeType: FOLDER },
    );

    const tree = await scanTree("token", "root", { maxDepth: 2 });

    expect(tree.children[0].name).toBe("one");
    expect(tree.children[0].children[0].name).toBe("two");
    // Depth 2 is the cap: "two" is reported but not opened.
    expect(tree.children[0].children[0].children).toEqual([]);
  });

  it("handles an empty folder", async () => {
    serveTree({ root: [] }, { id: "root", name: "Empty", mimeType: FOLDER });

    const tree = await scanTree("token", "root");

    expect(tree.isFolder).toBe(true);
    expect(tree.children).toEqual([]);
  });

  it("escapes the folder id in the query", async () => {
    serveTree({}, { id: "a'b", name: "R", mimeType: FOLDER });

    await scanTree("token", "a'b");

    expect(mockList.mock.calls[0][0].q).toContain("'a\\'b' in parents");
  });
});
