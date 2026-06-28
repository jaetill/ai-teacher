import { describe, it, expect } from "vitest";
import { escapeDriveQueryValue } from "@/lib/drive";

describe("escapeDriveQueryValue", () => {
  it("leaves ordinary values untouched", () => {
    expect(escapeDriveQueryValue("grade_8_Q1_Lessons")).toBe("grade_8_Q1_Lessons");
  });

  it("escapes a single quote so it cannot terminate the query literal", () => {
    expect(escapeDriveQueryValue("Mrs. O'Brien")).toBe("Mrs. O\\'Brien");
  });

  it("escapes backslashes before quotes (order matters)", () => {
    // A literal backslash followed by a quote must become \\ \' — escaping the
    // quote first would produce \\' which the API reads as escaped-backslash +
    // unescaped quote, re-opening the injection.
    expect(escapeDriveQueryValue("a\\'b")).toBe("a\\\\\\'b");
  });

  it("neutralizes an attempted query-clause injection", () => {
    // Without escaping, this name would close the `name = '...'` literal and
    // append `or trashed = false` — broadening the result set.
    const malicious = "x' or trashed = false or name = '";
    const escaped = escapeDriveQueryValue(malicious);
    // Every single quote is now backslash-escaped, so none can terminate the
    // surrounding `name = '...'` literal — the payload is treated as data.
    expect(escaped).toBe("x\\' or trashed = false or name = \\'");
    expect(escaped).not.toMatch(/(^|[^\\])'/);
  });
});
