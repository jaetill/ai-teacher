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
  const classifyCalls: { id: string; name: string }[][] = [];
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
      if (url.startsWith("/api/import/classify")) {
        const asked = JSON.parse(String(init?.body)).files as { id: string; name: string }[];
        classifyCalls.push(asked);
        return {
          ok: true,
          json: async () => ({
            classifications: asked.map((f) => ({ id: f.id, materialType: "activity" })),
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
  return { planBody, classifyCalls };
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

  // Her late-90s Grade 12 material: something to draw on later, not a year she
  // teaches. A course with no school year is the shelf.
  it("can import into a library instead of a school year", async () => {
    const { planBody } = mockFetch();
    const user = await scan();

    await user.selectOptions(screen.getByLabelText(/belongs to school year/i), "");
    await user.selectOptions(screen.getByLabelText(/which is grade/i), "12");

    await waitFor(() => expect(crumb()).toMatch(/Grade 12\s+›\s+Library/));
    // Nothing in a library sits in a quarter, so the rung is not shown at all.
    expect(screen.queryByLabelText(/belongs to quarter/i)).not.toBeInTheDocument();
    expect(crumb()).not.toMatch(/Q3|Q4|no quarter/);
    expect(screen.getByText(/starts a Grade 12 library/i)).toBeInTheDocument();

    await waitFor(() => expect(screen.getByText("2 activities")).toBeInTheDocument());
    await user.click(screen.getByRole("button", { name: /^import 3 files$/i }));

    await waitFor(() => expect(planBody).toHaveBeenCalled());
    expect(planBody.mock.calls[0][0].target).toMatchObject({
      grade: 12,
      schoolYearId: null,
      overrideQuarter: null,
    });
  });

  it("offers the grades the server has always accepted, not just 6-8", async () => {
    mockFetch();
    await scan();

    const options = Array.from(
      screen.getByLabelText(/which is grade/i).querySelectorAll("option"),
    ).map((o) => o.textContent);
    expect(options).toEqual([
      "Grade 6",
      "Grade 7",
      "Grade 8",
      "Grade 9",
      "Grade 10",
      "Grade 11",
      "Grade 12",
    ]);
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

  it("asks the model only about files her folders did not already classify", async () => {
    const { classifyCalls } = mockFetch();
    await scan();

    await waitFor(() => expect(classifyCalls.length).toBe(1));
    // dash.pptx sits under a "Lessons" folder, so it is never sent — that
    // answer is certain and free, and asking would risk overriding her.
    const askedNames = classifyCalls[0].map((f) => f.name);
    expect(askedNames).not.toContain("dash.pptx");
    expect(askedNames.sort()).toEqual(["dash-notes.docx", "refugee.pptx"]);
  });

  it("fills the gaps automatically, without her asking", async () => {
    mockFetch();
    await scan();

    // Folder-derived and model-derived both land, with nothing left unplaced.
    await waitFor(() => expect(screen.getByText("2 activities")).toBeInTheDocument());
    expect(screen.getByText("1 lesson")).toBeInTheDocument();
    expect(screen.queryByText(/unsure/)).not.toBeInTheDocument();
  });

  it("says which were typed from her folders and which were guessed", async () => {
    mockFetch();
    await scan();

    const note = await screen.findByText(/typed from your folder names/i);
    expect(note.textContent).toMatch(/1 typed from your folder names/);
    expect(note.textContent).toMatch(/2 were worked out from the filename/);
  });

  it("sends the guesses along with the import, not just her corrections", async () => {
    const { planBody } = mockFetch();
    const user = await scan();

    await waitFor(() => expect(screen.getByText("2 activities")).toBeInTheDocument());
    await user.click(screen.getByRole("button", { name: /^import 3 files$/i }));

    await waitFor(() => expect(planBody).toHaveBeenCalled());
    const files = planBody.mock.calls[0][0].files as { fileId: string; materialType: string }[];
    // The two guessed files travel with the plan; the folder-derived one does
    // not need to, because the server re-derives it from the same path.
    expect(files).toHaveLength(2);
    expect(files.every((f) => f.materialType === "activity")).toBe(true);
  });

  it("offers the guesses for review, and lets her overrule one", async () => {
    mockFetch();
    const user = await scan();

    await waitFor(() => expect(screen.getByText("2 activities")).toBeInTheDocument());
    // Only the guesses need checking — the folder-derived one is not listed.
    await user.click(screen.getByRole("button", { name: /check 2/i }));
    expect(screen.queryByLabelText(/Type for dash\.pptx/i)).not.toBeInTheDocument();

    await user.selectOptions(screen.getByLabelText(/Type for refugee\.pptx/i), "resource");

    await waitFor(() => expect(screen.getByText("1 resource")).toBeInTheDocument());
    expect(screen.getByText("1 activity")).toBeInTheDocument();
  });

  it("shows what is happening instead of dead buttons while it evaluates", async () => {
    // Never resolves, so the component stays in the classifying state.
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string) => {
        if (url.startsWith("/api/import/classify")) return new Promise(() => {});
        if (url.startsWith("/api/import/targets")) return { ok: true, json: async () => TARGETS };
        return {
          ok: true,
          json: async () => ({
            tree: GRADE6,
            proposal: { levels: ["container", "unit"], reason: "", alternatives: [] },
            fileCount: 3,
            folderCount: 3,
          }),
        };
      }),
    );
    const user = userEvent.setup();
    render(<ImportPlanner />);
    await user.type(screen.getByLabelText(/google drive link or id/i), "abc");
    await user.click(screen.getByRole("button", { name: /read it/i }));

    // No greyed-out buttons mid-flight: a plain statement of what is
    // happening replaces them, and neither action is offered yet.
    const status = await screen.findByRole("status");
    expect(status.textContent).toMatch(/working out what/i);
    expect(screen.queryByRole("button", { name: /^import/i })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /^check/i })).not.toBeInTheDocument();
  });

  it("sends structure, destination and her corrections in one request", async () => {
    const { planBody } = mockFetch();
    const user = await scan();

    await waitFor(() => expect(screen.getByText("2 activities")).toBeInTheDocument());
    await user.click(screen.getByRole("button", { name: /check 2/i }));
    await user.selectOptions(screen.getByLabelText(/Type for refugee\.pptx/i), "resource");
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
    // Her correction plus the remaining guess; the folder-derived one is
    // re-derived server-side from the same path.
    const files = body.files as { fileId: string; materialType: string }[];
    expect(files.map((f) => f.materialType).sort()).toEqual(["activity", "resource"]);

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
    expect(screen.getByText(/adds to what you already have/i)).toBeInTheDocument();

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
