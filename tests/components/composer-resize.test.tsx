import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

vi.mock("@/components/CopilotProvider", () => ({
  useCopilot: () => ({ isOpen: true, toggle: vi.fn(), pageContext: "" }),
}));

import CopilotPanel from "@/components/CopilotPanel";

// The composer sizes itself two ways and they have to stay separable:
// auto-grow follows the content, and the drag handle pins a height that
// outranks it. These tests cover the handle and the handover between them.
//
// jsdom has no layout, so offsetHeight is 0 and a pointer drag cannot be
// measured. The keyboard path exercises exactly the same state, so that is
// what is asserted here; the pointer handlers are thin wrappers over it.

beforeEach(() => {
  vi.stubGlobal(
    "fetch",
    vi.fn(async () => ({ ok: true, headers: new Headers(), body: null })),
  );
});
afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

const handle = () => screen.getByRole("separator", { name: /resize the message box/i });
const composer = () => screen.getByPlaceholderText(/ask your copilot/i) as HTMLTextAreaElement;

describe("composer resize handle", () => {
  it("offers a labelled, focusable handle", () => {
    render(<CopilotPanel />);
    const h = handle();
    expect(h).toHaveAttribute("aria-orientation", "horizontal");
    expect(h).toHaveAttribute("tabindex", "0");
  });

  it("grows the composer on ArrowUp and shrinks it on ArrowDown", () => {
    render(<CopilotPanel />);

    fireEvent.keyDown(handle(), { key: "ArrowUp" });
    const taller = parseInt(composer().style.height, 10);
    expect(taller).toBeGreaterThan(0);

    fireEvent.keyDown(handle(), { key: "ArrowUp" });
    const tallest = parseInt(composer().style.height, 10);
    expect(tallest).toBeGreaterThan(taller);

    fireEvent.keyDown(handle(), { key: "ArrowDown" });
    expect(parseInt(composer().style.height, 10)).toBeLessThan(tallest);
  });

  it("releases the auto-grow ceiling so a dragged height is not clamped", () => {
    // max-h-[200px] lives in the className. Without clearing max-height inline,
    // anything past the auto-grow cap would be silently trimmed and the handle
    // would appear to stop working halfway.
    render(<CopilotPanel />);
    expect(composer().style.maxHeight).toBe("");

    fireEvent.keyDown(handle(), { key: "ArrowUp" });
    expect(composer().style.maxHeight).toBe("none");
  });

  it("never shrinks below the minimum, however hard she pushes", () => {
    render(<CopilotPanel />);
    for (let i = 0; i < 20; i++) fireEvent.keyDown(handle(), { key: "ArrowDown" });
    expect(parseInt(composer().style.height, 10)).toBeGreaterThanOrEqual(40);
  });

  it("never grows past the maximum", () => {
    render(<CopilotPanel />);
    for (let i = 0; i < 60; i++) fireEvent.keyDown(handle(), { key: "ArrowUp" });
    expect(parseInt(composer().style.height, 10)).toBeLessThanOrEqual(420);
  });

  it("hands the height back to the content on double-click", () => {
    render(<CopilotPanel />);

    fireEvent.keyDown(handle(), { key: "ArrowUp" });
    expect(composer().style.maxHeight).toBe("none");

    fireEvent.doubleClick(handle());
    // Back under the class-based cap, and following the text again.
    expect(composer().style.maxHeight).toBe("");
  });

  it("hands it back on Enter and Escape too, for keyboard users", () => {
    render(<CopilotPanel />);

    for (const key of ["Enter", "Escape"]) {
      fireEvent.keyDown(handle(), { key: "ArrowUp" });
      expect(composer().style.maxHeight).toBe("none");
      fireEvent.keyDown(handle(), { key });
      expect(composer().style.maxHeight, `${key} should restore auto height`).toBe("");
    }
  });

  it("keeps her chosen height while she types", async () => {
    // The regression this guards: auto-grow re-running on every keystroke and
    // overwriting the height she set, which would make the handle feel broken
    // rather than sticky.
    render(<CopilotPanel />);

    fireEvent.keyDown(handle(), { key: "ArrowUp" });
    fireEvent.keyDown(handle(), { key: "ArrowUp" });
    const chosen = composer().style.height;

    await userEvent.type(composer(), "a question about Tiger, Tiger");

    expect(composer().style.height).toBe(chosen);
    expect(composer().style.maxHeight).toBe("none");
  });

  it("leaves the composer on auto-grow until she asks otherwise", () => {
    render(<CopilotPanel />);
    // No inline max-height means the className cap is still in force, which is
    // the auto-grow path.
    expect(composer().style.maxHeight).toBe("");
  });
});
