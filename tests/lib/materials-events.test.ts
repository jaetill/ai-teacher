import { describe, it, expect, vi, afterEach } from "vitest";
import {
  MATERIALS_IMPORTED_EVENT,
  announceMaterialsImported,
} from "../../src/lib/materials-events";

// #650: the import→summarize handshake is a window event; these tests pin the
// contract both sides rely on (event name, dispatch, SSR-safety).

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("materials-events", () => {
  it("dispatches the imported event on window", () => {
    const dispatched: Event[] = [];
    vi.stubGlobal("window", {
      dispatchEvent: (e: Event) => {
        dispatched.push(e);
        return true;
      },
    });
    announceMaterialsImported();
    expect(dispatched).toHaveLength(1);
    expect(dispatched[0].type).toBe(MATERIALS_IMPORTED_EVENT);
  });

  it("is a no-op without a window (SSR-safe)", () => {
    // Node test env has no window by default; must not throw.
    expect(() => announceMaterialsImported()).not.toThrow();
  });
});
