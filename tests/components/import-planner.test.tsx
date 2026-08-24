import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import ImportPlanner, { extractDriveId } from "@/components/ImportPlanner";
import type { ScannedNode } from "@/lib/drive";

let seq = 0;
function file(name: string, mimeType = "application/vnd.google-apps.presentation"): ScannedNode {
  return { id: `f${++seq}`, name, mimeType, isFolder: false, children: [] };
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

// Her real Grade 6 folder: eight units, each named for the book with the
// quarter after it, and a Lessons subfolder inside one of them.
const GRADE6 = folder(
  "Grade 6 English",
  folder("Dash Q3", folder("Lessons", file("dash.pptx")), file("dash-notes.docx")),
  folder("Refugee Q4", file("refugee.pptx")),
);

const TARGETS = {
  schoolYears: [
    { id: "sy-25", name: "2025-2026", isCurrent: false },
    { id: "sy-26", name: "2026-2027", isCurrent: true },
  ],
  courses: [{ id: "c1", grade: 7, track: null, schoolYearId: "sy-26" }],
  currentSchoolYearId: "sy-26",
};

function mockFetch() {
  const planBody = vi.fn();
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string, init?: RequestInit) => {
      if (url.startsWith("/api/import/scan")) {
        return {
          ok: true,
          json: async () => ({
            tree: GRADE6,
            proposal: {
              levels: ["container", "unit"],
              reason:
                "2 of 2 subfolders are named for something with a quarter after it, so each one is a unit.",
              alternatives: [],
            },
            fileCount: 3,
            folderCount: 3,
          }),
        };
      }
      if (url.startsWith("/api/import/targets")) return { ok: true, json: async () => TARGETS };
      if (url.startsWith("/api/import/plan")) {
        planBody(JSON.parse(String(init?.body)));
        return {
          ok: true,
          json: async () => ({
            created: 3,
            updated: 0,
            total: 3,
            courseCreated: true,
            units: ["Dash Q3", "Refugee Q4"],
            warnings: [],
          }),
        };
      }
      throw new Error(`unexpected fetch: ${url}`);
    }),
  );
  return { planBody };
}

async function scan() {
  const user = userEvent.setup();
  render(<ImportPlanner />);
  await user.type(
    screen.getByLabelText(/google drive link or id/i),
    "https://drive.google.com/drive/folders/abc123",
  );
  await user.click(screen.getByRole("button", { name: /read it/i }));
  await screen.findByLabelText(/what is it/i);
  return user;
}

beforeEach(() => {
  seq = 0;
});
afterEach(() => {
  vi.unstubAllGlobals();
});

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

describe("ImportPlanner — one screen, not a wizard", () => {
  it("puts structure, destination and the import button on one screen", async () => {
    mockFetch();
    await scan();

    // No stepped panels: everything is visible at once after a single read.
    expect(screen.getByLabelText(/what is it/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/school year/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/^grade$/i)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /^import 3 files$/i })).toBeInTheDocument();
  });

  it("offers the structure as one plain-English choice, not a per-depth grid", async () => {
    mockFetch();
    await scan();

    const shape = screen.getByLabelText(/what is it/i);
    expect(shape).toHaveValue("units");
    expect(screen.queryByLabelText(/folders one level deeper/i)).not.toBeInTheDocument();
  });

  it("reads her book-plus-quarter folders as units and places them by name", async () => {
    mockFetch();
    await scan();

    // Two units, and their quarters come from the folder names — no clicks.
    const summary = screen.getByText(
      (_, el) => el?.tagName === "P" && /2 units in Q3, Q4, 3 files/.test(el.textContent ?? ""),
    );
    expect(summary).toBeInTheDocument();
    expect(screen.getByText(/Dash Q3 · Refugee Q4/)).toBeInTheDocument();
  });

  it("re-derives everything instantly when she changes what it is", async () => {
    mockFetch();
    const user = await scan();

    await user.selectOptions(screen.getByLabelText(/what is it/i), "unit");

    await waitFor(() => {
      expect(screen.getByText("Grade 6 English")).toBeInTheDocument();
    });
    expect(screen.queryByText(/Dash Q3 · Refugee Q4/)).not.toBeInTheDocument();
  });

  it("classifies from her folder names and flags only what it could not place", async () => {
    mockFetch();
    await scan();

    // dash.pptx sits under a "Lessons" folder; the other two do not.
    expect(screen.getByText("Lessons 1")).toBeInTheDocument();
    expect(screen.getByText("Unclassified 2")).toBeInTheDocument();
  });

  it("lets her fix the unclassified ones in bulk without a review table", async () => {
    mockFetch();
    const user = await scan();

    await user.click(screen.getByRole("button", { name: /fix these/i }));
    await user.selectOptions(screen.getByLabelText(/set all unclassified files to/i), "Resources");

    await waitFor(() => expect(screen.getByText("Resources 2")).toBeInTheDocument());
    expect(screen.queryByText(/Unclassified/)).not.toBeInTheDocument();
  });

  it("does not show a fix-up step when nothing needs fixing", async () => {
    mockFetch();
    await scan();
    expect(screen.queryByLabelText(/set all unclassified files to/i)).not.toBeInTheDocument();
  });

  it("sends structure, destination and her corrections in one request", async () => {
    const { planBody } = mockFetch();
    const user = await scan();

    await user.click(screen.getByRole("button", { name: /fix these/i }));
    await user.selectOptions(screen.getByLabelText(/set all unclassified files to/i), "Resources");
    await user.selectOptions(screen.getByLabelText(/school year/i), "sy-25");
    await user.selectOptions(screen.getByLabelText(/^grade$/i), "6");
    await user.click(screen.getByRole("button", { name: /^import 3 files$/i }));

    await waitFor(() => expect(planBody).toHaveBeenCalled());
    const body = planBody.mock.calls[0][0];
    expect(body).toMatchObject({
      source: { kind: "drive-folder", folderId: "abc123" },
      levels: ["container", "unit"],
      target: { grade: 6, schoolYearId: "sy-25", track: null },
    });
    expect(body.files).toHaveLength(2);
    expect(body.files.every((f: { category: string }) => f.category === "Resources")).toBe(true);

    expect(await screen.findByText(/imported 3 files/i)).toBeInTheDocument();
  });

  it("says whether the import creates a course or joins one", async () => {
    mockFetch();
    const user = await scan();

    // Grade 7 / current year exists in TARGETS; the default grade is 7.
    expect(screen.getByText(/adds to your existing course/i)).toBeInTheDocument();

    await user.selectOptions(screen.getByLabelText(/^grade$/i), "6");
    expect(await screen.findByText(/creates a new course/i)).toBeInTheDocument();
  });

  it("surfaces a scan failure rather than an empty screen", async () => {
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
    await user.click(screen.getByRole("button", { name: /read it/i }));

    expect(await screen.findByText("Failed to scan")).toBeInTheDocument();
    expect(screen.queryByLabelText(/what is it/i)).not.toBeInTheDocument();
  });
});
