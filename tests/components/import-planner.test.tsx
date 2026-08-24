import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import ImportPlanner, { extractDriveId, folderDepth } from "@/components/ImportPlanner";
import type { ScannedNode } from "@/lib/drive";

// ── tree fixtures ───

let seq = 0;
function file(name: string): ScannedNode {
  return {
    id: `f${++seq}`,
    name,
    mimeType: "application/vnd.google-apps.presentation",
    isFolder: false,
    children: [],
  };
}
function folder(name: string, ...children: ScannedNode[]): ScannedNode {
  return {
    id: `d${++seq}`,
    name,
    mimeType: "application/vnd.google-apps.folder",
    isFolder: true,
    children,
  };
}

const YEAR_TREE = folder(
  "Grade 7 English",
  folder("Q1", folder("Fever 1793", file("fever.pptx"), file("fever-quiz.docx"))),
  folder("Q2", folder("The Westing Game", file("westing.pptx"))),
);

const TARGETS = {
  schoolYears: [
    { id: "sy-25", name: "2025-2026", isCurrent: false },
    { id: "sy-26", name: "2026-2027", isCurrent: true },
  ],
  courses: [{ id: "c1", grade: 7, track: null, schoolYearId: "sy-26" }],
  currentSchoolYearId: "sy-26",
};

/** Route fetch by URL so tests do not depend on call order. */
function mockFetch(overrides: Record<string, unknown> = {}) {
  const planBody = vi.fn();
  const impl = vi.fn(async (url: string, init?: RequestInit) => {
    if (url.startsWith("/api/import/scan")) {
      return {
        ok: true,
        json: async () => ({
          tree: YEAR_TREE,
          proposal: {
            levels: ["year", "quarter", "unit"],
            reason: "2 of 2 subfolders read as quarters, so this looks like a whole year.",
            alternatives: [
              { levels: ["container", "quarter", "unit"], reason: "Not a school year" },
            ],
          },
          fileCount: 3,
          folderCount: 4,
          ...(overrides.scan as object),
        }),
      };
    }
    if (url.startsWith("/api/import/targets")) {
      return { ok: true, json: async () => TARGETS };
    }
    if (url.startsWith("/api/import/plan")) {
      planBody(JSON.parse(String(init?.body)));
      return {
        ok: true,
        json: async () => ({
          courseId: "c1",
          courseCreated: false,
          created: 3,
          updated: 0,
          total: 3,
          units: ["Fever 1793", "The Westing Game"],
          warnings: [],
          ...(overrides.plan as object),
        }),
      };
    }
    throw new Error(`unexpected fetch: ${url}`);
  });
  vi.stubGlobal("fetch", impl);
  return { planBody };
}

async function scanFolder() {
  const user = userEvent.setup();
  render(<ImportPlanner />);
  await user.type(
    screen.getByLabelText(/google drive link or id/i),
    "https://drive.google.com/drive/folders/abc123",
  );
  await user.click(screen.getByRole("button", { name: /look at it/i }));
  await screen.findByText(/what is this/i);
  return user;
}

beforeEach(() => {
  seq = 0;
});
afterEach(() => {
  vi.unstubAllGlobals();
});

// ── pure helpers ───

describe("extractDriveId", () => {
  it.each([
    ["https://drive.google.com/drive/folders/1AbC_-9", "1AbC_-9"],
    ["https://docs.google.com/document/d/FILEID/edit", "FILEID"],
    ["https://drive.google.com/open?id=OPENID", "OPENID"],
    ["  bareId123  ", "bareId123"],
  ])("pulls the id out of %s", (input, expected) => {
    expect(extractDriveId(input)).toBe(expected);
  });
});

describe("folderDepth", () => {
  it("counts folder nesting and ignores files", () => {
    expect(folderDepth(folder("a", file("x")))).toBe(0);
    expect(folderDepth(folder("a", folder("b", file("x"))))).toBe(1);
    expect(folderDepth(YEAR_TREE)).toBe(2);
  });
});

// ── the flow ───

describe("ImportPlanner", () => {
  it("asks what before where — the destination step appears only after a scan", async () => {
    mockFetch();
    render(<ImportPlanner />);

    expect(screen.getByText(/1 · what are you importing/i)).toBeInTheDocument();
    expect(screen.queryByText(/where does it go/i)).not.toBeInTheDocument();
    expect(screen.queryByLabelText(/school year/i)).not.toBeInTheDocument();
  });

  it("shows the proposed reading and what it works out to", async () => {
    mockFetch();
    await scanFolder();

    expect(screen.getByText(/subfolders read as quarters/i)).toBeInTheDocument();
    // Derived in the browser from the tree, not fetched. The sentence is split
    // across <strong> tags, so match on the element's whole text.
    const summary = screen.getByText(
      (_, el) =>
        el?.tagName === "P" &&
        /That reads as 2 units across Q1, Q2, with 3 files/.test(el.textContent ?? ""),
    );
    expect(summary).toBeInTheDocument();
    expect(screen.getByText(/Fever 1793 · The Westing Game/)).toBeInTheDocument();
  });

  it("re-derives units immediately when she changes what a level means", async () => {
    mockFetch();
    const user = await scanFolder();

    expect(screen.getByText(/Fever 1793 · The Westing Game/)).toBeInTheDocument();

    // Say the whole thing is one unit instead.
    await user.selectOptions(screen.getByLabelText(/the folder you picked is/i), "unit");

    // The deeper levels said "quarter" and "unit"; nothing nests under a unit,
    // so they are cleared rather than left as an impossible map.
    expect(await screen.findByText(/deeper levels were cleared/i)).toBeInTheDocument();
    expect(screen.getByText("Grade 7 English")).toBeInTheDocument();
    expect(screen.queryByText(/Fever 1793 · The Westing Game/)).not.toBeInTheDocument();
  });

  it("offers the alternative reading as one click", async () => {
    mockFetch();
    const user = await scanFolder();

    await user.click(screen.getByRole("button", { name: /not a school year/i }));

    await waitFor(() => {
      expect(screen.getByLabelText(/the folder you picked is/i)).toHaveValue("container");
    });
  });

  it("never lets her build a map whose levels do not nest", async () => {
    mockFetch();
    const user = await scanFolder();

    await user.selectOptions(screen.getByLabelText(/the folder you picked is/i), "unit");
    // A quarter inside a unit is nonsense; the choice is dropped rather than
    // accepted and then rejected with an error.
    await user.selectOptions(screen.getByLabelText(/folders inside it are/i), "quarter");

    await waitFor(() => {
      expect(screen.getByLabelText(/folders inside it are/i)).toHaveValue("container");
    });
    expect(screen.queryByText(/cannot contain/i)).not.toBeInTheDocument();
    // Still importable — she is never stuck in an invalid state.
    expect(screen.getByRole("button", { name: /^import /i })).toBeEnabled();
  });

  it("defaults the destination to the current school year but lets her pick a past one", async () => {
    mockFetch();
    const user = await scanFolder();

    const yearSelect = await screen.findByLabelText(/school year/i);
    expect(yearSelect).toHaveValue("sy-26");

    await user.selectOptions(yearSelect, "sy-25");
    expect(yearSelect).toHaveValue("sy-25");
    // Importing into a year with no course must say so rather than silently creating one.
    expect(await screen.findByText(/no course exists/i)).toBeInTheDocument();
  });

  it("says when the import will land in a course that already exists", async () => {
    mockFetch();
    await scanFolder();
    expect(await screen.findByText(/adds to the course you already have/i)).toBeInTheDocument();
  });

  it("sends source, levels and target together, and reports the result", async () => {
    const { planBody } = mockFetch();
    const user = await scanFolder();

    await user.click(await screen.findByRole("button", { name: /import 3 files/i }));

    await waitFor(() => expect(planBody).toHaveBeenCalled());
    expect(planBody.mock.calls[0][0]).toMatchObject({
      source: { kind: "drive-folder", folderId: "abc123" },
      levels: ["year", "quarter", "unit"],
      target: { grade: 7, schoolYearId: "sy-26", track: null },
    });

    expect(await screen.findByText(/imported 3 files/i)).toBeInTheDocument();
  });

  it("promises that nothing is copied or moved", async () => {
    mockFetch();
    await scanFolder();
    expect(screen.getByText(/nothing is copied or moved/i)).toBeInTheDocument();
  });

  it("surfaces a scan failure instead of a blank step 2", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string) =>
        url.startsWith("/api/import/scan")
          ? { ok: false, json: async () => ({ error: "Failed to scan" }) }
          : { ok: true, json: async () => TARGETS },
      ),
    );
    const user = userEvent.setup();
    render(<ImportPlanner />);
    await user.type(screen.getByLabelText(/google drive link or id/i), "abc");
    await user.click(screen.getByRole("button", { name: /look at it/i }));

    expect(await screen.findByText("Failed to scan")).toBeInTheDocument();
    expect(screen.queryByText(/what is this/i)).not.toBeInTheDocument();
  });

  it("offers a quarter for loose files only when some files have none", async () => {
    mockFetch();
    const user = await scanFolder();

    // Every file is inside a quarter folder, so the fallback is not offered.
    expect(screen.queryByLabelText(/quarter for files your folders did not place/i)).toBeNull();

    // Declaring no quarters leaves every file unplaced.
    await user.selectOptions(screen.getByLabelText(/the folder you picked is/i), "unit");

    expect(
      await screen.findByLabelText(/quarter for files your folders did not place/i),
    ).toBeInTheDocument();
  });
});
