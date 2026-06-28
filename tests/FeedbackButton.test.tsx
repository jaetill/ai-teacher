import { describe, it, expect } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import FeedbackButton from "@/components/FeedbackButton";

async function openDialog() {
  const user = userEvent.setup();
  render(<FeedbackButton />);
  const trigger = screen.getByRole("button", { name: "Send feedback" });
  await user.click(trigger);
  return { user, trigger };
}

describe("FeedbackButton privacy disclosure", () => {
  it("disclosure copy does not claim email is stored", async () => {
    await openDialog();
    const disclosure = screen.getByText(/we collect only what you type/i);
    expect(disclosure.textContent).not.toMatch(/stored privately/i);
    expect(disclosure.textContent).not.toMatch(/stored for/i);
  });
});

describe("FeedbackButton keyboard accessibility", () => {
  it("auto-focuses the Type select when dialog opens", async () => {
    await openDialog();
    await waitFor(() => expect(screen.getByLabelText("Type")).toHaveFocus());
  });

  it("Escape closes dialog and returns focus to trigger button", async () => {
    const { user, trigger } = await openDialog();
    await user.keyboard("{Escape}");
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
    expect(trigger).toHaveFocus();
  });

  it("Tab from Submit button wraps focus to Type select", async () => {
    const { user } = await openDialog();
    screen.getByRole("button", { name: "Submit" }).focus();
    await user.keyboard("{Tab}");
    await waitFor(() => expect(screen.getByLabelText("Type")).toHaveFocus());
  });

  it("Shift+Tab from Type select wraps focus to Submit button", async () => {
    const { user } = await openDialog();
    screen.getByLabelText("Type").focus();
    await user.keyboard("{Shift>}{Tab}{/Shift}");
    await waitFor(() => expect(screen.getByRole("button", { name: "Submit" })).toHaveFocus());
  });

  it("Cancel button closes dialog and returns focus to trigger button", async () => {
    const { user, trigger } = await openDialog();
    await user.click(screen.getByRole("button", { name: "Cancel" }));
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
    expect(trigger).toHaveFocus();
  });
});
