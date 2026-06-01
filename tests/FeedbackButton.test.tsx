import { describe, it, expect } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import FeedbackButton from "@/components/FeedbackButton";

async function openDialog() {
  const user = userEvent.setup();
  render(<FeedbackButton />);
  const trigger = screen.getByRole("button", { name: "Send feedback" });
  await user.click(trigger);
  return { user, trigger };
}

describe("FeedbackButton keyboard accessibility", () => {
  it("auto-focuses the Type select when dialog opens", async () => {
    await openDialog();
    await waitFor(() => expect(screen.getByLabelText("Type")).toHaveFocus());
  });

  it("Escape closes dialog and returns focus to trigger button", async () => {
    const { trigger } = await openDialog();
    fireEvent.keyDown(screen.getByRole("dialog"), { key: "Escape" });
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
    expect(trigger).toHaveFocus();
  });

  it("Tab from Submit button wraps focus to Type select", async () => {
    await openDialog();
    screen.getByRole("button", { name: "Submit" }).focus();
    fireEvent.keyDown(screen.getByRole("dialog"), { key: "Tab" });
    expect(screen.getByLabelText("Type")).toHaveFocus();
  });

  it("Shift+Tab from Type select wraps focus to Submit button", async () => {
    await openDialog();
    screen.getByLabelText("Type").focus();
    fireEvent.keyDown(screen.getByRole("dialog"), { key: "Tab", shiftKey: true });
    expect(screen.getByRole("button", { name: "Submit" })).toHaveFocus();
  });

  it("Cancel button closes dialog and returns focus to trigger button", async () => {
    const { user, trigger } = await openDialog();
    await user.click(screen.getByRole("button", { name: "Cancel" }));
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
    expect(trigger).toHaveFocus();
  });
});
