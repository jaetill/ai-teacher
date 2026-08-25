import { describe, it, expect } from "vitest";
import {
  ACCEPT_ATTR,
  DOCX_MIME,
  MAX_FILE_BYTES,
  kindFor,
  rejectionReason,
} from "@/lib/copilot-attachments";

describe("kindFor", () => {
  it.each([
    ["image/png", "image"],
    ["image/jpeg", "image"],
    ["image/webp", "image"],
    ["application/pdf", "pdf"],
    ["text/plain", "text"],
    ["text/csv", "text"],
    [DOCX_MIME, "text"],
  ])("reads %s as %s", (mime, expected) => {
    expect(kindFor(mime)).toBe(expected);
  });

  it("falls back to the filename when the browser reports no type", () => {
    // Windows and some browsers report "" for .md and .csv.
    expect(kindFor("", "notes.md")).toBe("text");
    expect(kindFor("", "scores.csv")).toBe("text");
    expect(kindFor("", "plan.docx")).toBe("text");
  });

  it("refuses what neither we nor the model can read", () => {
    expect(kindFor("application/vnd.ms-powerpoint", "old.ppt")).toBeNull();
    expect(kindFor("application/zip", "unit.zip")).toBeNull();
    expect(kindFor("", "mystery.xyz")).toBeNull();
  });
});

describe("rejectionReason", () => {
  const file = (name: string, type = "", size = 1000) => ({ name, type, size });

  it("accepts what we can read", () => {
    expect(rejectionReason(file("shot.png", "image/png"))).toBeNull();
    expect(rejectionReason(file("unit.pdf", "application/pdf"))).toBeNull();
    expect(rejectionReason(file("plan.docx", DOCX_MIME))).toBeNull();
  });

  it("tells her what to do about a PowerPoint rather than just refusing", () => {
    // A lesson IS usually a deck, so this is the rejection she will hit most.
    const reason = rejectionReason(file("Giver Ch1.pptx"))!;
    expect(reason).toMatch(/PDF/i);
    expect(reason).toMatch(/screenshot/i);
  });

  it("tells her how to rescue an old .doc", () => {
    expect(rejectionReason(file("1998 essay.doc"))!).toMatch(/\.docx/);
  });

  it("rejects a file that is too large, by name", () => {
    const reason = rejectionReason(file("huge.png", "image/png", MAX_FILE_BYTES + 1))!;
    expect(reason).toContain("huge.png");
    expect(reason).toMatch(/too big/i);
  });

  it("size is checked before type, so a huge junk file says the useful thing", () => {
    expect(rejectionReason(file("huge.zip", "application/zip", MAX_FILE_BYTES + 1))!).toMatch(
      /too big/i,
    );
  });
});

describe("ACCEPT_ATTR", () => {
  it("offers exactly what kindFor will accept", () => {
    // A picker that offers a type the code then rejects is a trap.
    for (const entry of ACCEPT_ATTR.split(",")) {
      const ok = entry.startsWith(".") ? kindFor("", `file${entry}`) : kindFor(entry, "file");
      expect(ok, `${entry} is offered but not accepted`).not.toBeNull();
    }
  });
});
