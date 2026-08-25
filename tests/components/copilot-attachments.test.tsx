import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, waitFor, fireEvent } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

vi.mock("@/components/CopilotProvider", () => ({
  useCopilot: () => ({ isOpen: true, toggle: vi.fn(), pageContext: "" }),
}));

import CopilotPanel from "@/components/CopilotPanel";

/** Capture what the panel POSTs, and stream back a trivial reply. */
function mockCopilotFetch() {
  const sent = vi.fn();
  vi.stubGlobal(
    "fetch",
    vi.fn(async (_url: string, init?: RequestInit) => {
      sent(JSON.parse(String(init?.body)));
      return {
        ok: true,
        headers: new Headers({ "X-Conversation-Id": "conv-1" }),
        body: {
          getReader: () => {
            let done = false;
            return {
              read: async () => {
                if (done) return { done: true, value: undefined };
                done = true;
                return { done: false, value: new TextEncoder().encode("ok") };
              },
            };
          },
        },
      };
    }),
  );
  return sent;
}

const png = (name = "shot.png") =>
  new File([new Uint8Array([137, 80, 78, 71])], name, { type: "image/png" });

beforeEach(() => {
  mockCopilotFetch();
});
afterEach(() => {
  vi.unstubAllGlobals();
});

describe("CopilotPanel attachments", () => {
  it("shows a chip for a picked file and lets her remove it", async () => {
    const user = userEvent.setup();
    render(<CopilotPanel />);

    const input = document.querySelector('input[type="file"]') as HTMLInputElement;
    await user.upload(input, png());

    expect(await screen.findByText("shot.png")).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: /remove shot\.png/i }));
    await waitFor(() => expect(screen.queryByText("shot.png")).not.toBeInTheDocument());
  });

  it("sends the file as base64 with its kind, alongside the message", async () => {
    const sent = mockCopilotFetch();
    const user = userEvent.setup();
    render(<CopilotPanel />);

    const input = document.querySelector('input[type="file"]') as HTMLInputElement;
    await user.upload(input, png());
    await screen.findByText("shot.png");

    await user.type(screen.getByPlaceholderText(/ask your copilot/i), "what is this?");
    await user.click(screen.getByRole("button", { name: /^send$/i }));

    await waitFor(() => expect(sent).toHaveBeenCalled());
    const body = sent.mock.calls[0][0];
    expect(body.attachments).toHaveLength(1);
    expect(body.attachments[0]).toMatchObject({
      name: "shot.png",
      kind: "image",
      mediaType: "image/png",
    });
    // base64, not a data: URL and not the raw bytes.
    expect(body.attachments[0].data).toMatch(/^[A-Za-z0-9+/=]+$/);
    // The local-only id must not travel.
    expect(body.attachments[0]).not.toHaveProperty("localId");
  });

  it("lets her send a file with no typed message", async () => {
    const sent = mockCopilotFetch();
    const user = userEvent.setup();
    render(<CopilotPanel />);

    // Send is disabled with nothing at all...
    expect(screen.getByRole("button", { name: /^send$/i })).toBeDisabled();

    const input = document.querySelector('input[type="file"]') as HTMLInputElement;
    await user.upload(input, png());
    await screen.findByText("shot.png");

    // ...but a dropped file is a turn on its own.
    const send = screen.getByRole("button", { name: /^send$/i });
    expect(send).toBeEnabled();
    await user.click(send);

    await waitFor(() => expect(sent).toHaveBeenCalled());
    expect(sent.mock.calls[0][0].attachments).toHaveLength(1);
  });

  it("refuses a dragged-in PowerPoint and says what to do instead", async () => {
    // The file picker filters by `accept`, so a .pptx can only arrive by drag
    // or paste — which is precisely where the explanation has to be good,
    // because a lesson usually IS a deck and she will try this.
    render(<CopilotPanel />);
    const composer = screen
      .getByPlaceholderText(/ask your copilot/i)
      .closest("div")!.parentElement!;

    fireEvent.drop(composer, {
      dataTransfer: {
        files: [
          new File(["x"], "Giver Ch1.pptx", {
            type: "application/vnd.openxmlformats-officedocument.presentationml.presentation",
          }),
        ],
      },
    });

    const msg = await screen.findByText(/PowerPoint files can't be read/i);
    expect(msg.textContent).toMatch(/screenshot/i);
    expect(screen.queryByText("Giver Ch1.pptx")).not.toBeInTheDocument();
  });

  it("accepts a file dropped onto the composer", async () => {
    render(<CopilotPanel />);
    const composer = screen
      .getByPlaceholderText(/ask your copilot/i)
      .closest("div")!.parentElement!;

    fireEvent.drop(composer, { dataTransfer: { files: [png("dropped.png")] } });

    expect(await screen.findByText("dropped.png")).toBeInTheDocument();
  });

  it("accepts a pasted screenshot and gives it a real name", async () => {
    render(<CopilotPanel />);
    const textarea = screen.getByPlaceholderText(/ask your copilot/i);

    // Chrome names clipboard images "image.png" every time; two pastes must
    // not collapse into one indistinguishable chip.
    fireEvent.paste(textarea, { clipboardData: { files: [png("image.png")] } });

    const chip = await screen.findByText(/^pasted-\d{6}\.png$/);
    expect(chip).toBeInTheDocument();
  });

  it("keeps the filenames on her turn in the transcript", async () => {
    const user = userEvent.setup();
    render(<CopilotPanel />);

    const input = document.querySelector('input[type="file"]') as HTMLInputElement;
    await user.upload(input, png());
    await screen.findByText("shot.png");
    await user.click(screen.getByRole("button", { name: /^send$/i }));

    expect(await screen.findByText(/📎 shot\.png/)).toBeInTheDocument();
  });
});
