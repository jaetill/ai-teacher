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
            courseId: "c1",
            unitsCreated: 2,
            unitsReused: 0,
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
  await screen.findByLabelText(/what did you point at/i);
  return user;
}

const crumb = () => screen.getByTestId("placement-breadcrumb").textContent ?? "";

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

describe("ImportPlanner — the hierarchy, stated out loud", () => {
  it("spells out grade > year > quarter > unit rather than leaving her to infer it", async () => {
    mockFetch();
    await scan();

    const explainer = screen.getByText(
      (_, el) =>
        el?.tagName === "P" &&
        /grade[\s\S]+school years[\s\S]+quarters[\s\S]+units[\s\S]+files/i.test(
          el.textContent ?? "",
        ),
    );
    expect(explainer).toBeInTheDocument();
  });

  it("asks what she pointed at, then only the rungs above it", async () => {
    mockFetch();
    const user = await scan();

    // Pointing at units needs a quarter, a year and a grade.
    expect(screen.getByLabelText(/what did you point at/i)).toHaveValue("units");
    expect(screen.getByLabelText(/belongs to quarter/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/belongs to school year/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/which is grade/i)).toBeInTheDocument();

    // A whole year already contains its quarters, so it is not asked for.
    await user.selectOptions(screen.getByLabelText(/what did you point at/i), "year");
    await waitFor(() => {
      expect(screen.queryByLabelText(/belongs to quarter/i)).not.toBeInTheDocument();
    });
    expect(screen.getByLabelText(/belongs to school year/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/which is grade/i)).toBeInTheDocument();
  });

  it("shows the chain back to her as a breadcrumb", async () => {
    mockFetch();
    await scan();

    expect(crumb()).toMatch(/Grade 7\s+›\s+2026-2027\s+›\s+Q3, Q4\s+›\s+2 units\s+›\s+3 files/);
  });

  it("puts everything and the import button on one screen", async () => {
    mockFetch();
    await scan();

    expect(screen.getByRole("button", { name: /^import 3 files$/i })).toBeInTheDocument();
    // No per-depth grid.
    expect(screen.queryByLabelText(/folders one level deeper/i)).not.toBeInTheDocument();
  });

  it("defaults the quarter to her folder names when they answer the question", async () => {
    mockFetch();
    await scan();

    expect(screen.getByLabelText(/belongs to quarter/i)).toHaveValue("__auto__");
    expect(screen.getByRole("option", { name: /from the folder names \(Q3, Q4\)/i })).toBeTruthy();
  });

  it("lets her state a quarter outright, which outranks the folder names", async () => {
    mockFetch();
    const user = await scan();

    expect(crumb()).toContain("Q3, Q4");

    await user.selectOptions(screen.getByLabelText(/belongs to quarter/i), "Q1");

    await waitFor(() => expect(crumb()).toContain("Q1"));
    expect(crumb()).not.toContain("Q3, Q4");
  });

  it("re-derives everything instantly when she changes what she pointed at", async () => {
    mockFetch();
    const user = await scan();

    await user.selectOptions(screen.getByLabelText(/what did you point at/i), "unit");

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
    await user.selectOptions(screen.getByLabelText(/belongs to school year/i), "sy-25");
    await user.selectOptions(screen.getByLabelText(/which is grade/i), "6");
    await user.click(screen.getByRole("button", { name: /^import 3 files$/i }));

    await waitFor(() => expect(planBody).toHaveBeenCalled());
    const body = planBody.mock.calls[0][0];
    expect(body).toMatchObject({
      source: { kind: "drive-folder", folderId: "abc123" },
      levels: ["container", "unit"],
      target: { grade: 6, schoolYearId: "sy-25", track: null, overrideQuarter: null },
    });
    expect(body.files).toHaveLength(2);
    expect(body.files.every((f: { category: string }) => f.category === "Resources")).toBe(true);

    const done = await screen.findByText(/imported 3 files/i);
    // The curriculum exists already — no Build step is offered or implied.
    expect(done.textContent).toMatch(/2 new units/);
    expect(done.textContent).toMatch(/nothing left to build/i);
    expect(screen.getByRole("link", { name: /open the curriculum/i })).toBeInTheDocument();
  });

  it("says whether the import creates a course or joins one", async () => {
    mockFetch();
    const user = await scan();

    // Grade 7 / current year exists in TARGETS; the default grade is 7.
    expect(screen.getByText(/adds to your existing course/i)).toBeInTheDocument();

    await user.selectOptions(screen.getByLabelText(/which is grade/i), "6");
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
    expect(screen.queryByLabelText(/what did you point at/i)).not.toBeInTheDocument();
  });
});
