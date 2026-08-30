"use client";

import { useState, useRef, useEffect, useLayoutEffect, isValidElement } from "react";
import type { ReactNode } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { useCopilot } from "./CopilotProvider";
import DraftCard from "./DraftCard";
import { parseDraftBlock } from "@/lib/draft-protocol";
import {
  ACCEPT_ATTR,
  DOCX_MIME,
  MAX_ATTACHMENTS,
  MAX_TOTAL_BYTES,
  kindFor,
  rejectionReason,
  type OutgoingAttachment,
} from "@/lib/copilot-attachments";

// Extract the raw text of a ```draft code block from the <pre> renderer's
// children, or null when this <pre> isn't a (complete) draft block.
function draftFromPreChildren(children: ReactNode): string | null {
  const child = Array.isArray(children) ? children[0] : children;
  if (!isValidElement(child)) return null;
  const props = child.props as { className?: string; children?: ReactNode };
  if (!props.className?.includes("language-draft")) return null;
  const raw = props.children;
  return typeof raw === "string" ? raw : Array.isArray(raw) ? raw.join("") : null;
}

/**
 * The readable half of a failed response.
 *
 * The route answers with plain text for the size limits and JSON `{error}` for
 * auth failures, so try both before falling back to the status code. Never
 * throws — an unreadable body must not replace the real failure.
 */
async function errorDetail(res: Response): Promise<string> {
  const fallback = `Something went wrong (${res.status}). Please try again.`;
  try {
    const raw = (await res.text()).trim();
    if (!raw) return fallback;
    if (raw.startsWith("{")) {
      const parsed = JSON.parse(raw) as { error?: unknown };
      return typeof parsed.error === "string" && parsed.error ? parsed.error : fallback;
    }
    // Guard against an HTML error page (a platform timeout, say) landing in
    // the transcript as markup.
    return raw.startsWith("<") || raw.length > 300 ? fallback : raw;
  } catch {
    return fallback;
  }
}

interface Message {
  role: "user" | "assistant";
  content: string;
  /** Filenames she attached, so the transcript shows them on her own turn. */
  attachments?: string[];
}

type PendingAttachment = OutgoingAttachment & { localId: string };

/** Read a File into the shape the route wants: base64, or text for text. */
async function readAttachment(file: File): Promise<PendingAttachment> {
  const kind = kindFor(file.type, file.name)!;
  const mediaType =
    file.type || (/\.docx$/i.test(file.name) ? DOCX_MIME : "text/plain");

  // .docx is binary but becomes text server-side, so it travels as base64.
  const asText = kind === "text" && mediaType !== DOCX_MIME;
  const data = asText
    ? await file.text()
    : arrayBufferToBase64(await file.arrayBuffer());

  return {
    localId: `${file.name}-${file.size}-${Date.now()}`,
    name: file.name,
    mediaType,
    kind,
    data,
    size: file.size,
  };
}

/** btoa needs a binary string; chunked so a 4MB file does not blow the stack. */
function arrayBufferToBase64(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer);
  let binary = "";
  const CHUNK = 0x8000;
  for (let i = 0; i < bytes.length; i += CHUNK) {
    binary += String.fromCharCode(...bytes.subarray(i, i + CHUNK));
  }
  return btoa(binary);
}

/** Composer grows to this height (~8 lines), then scrolls internally. */
const COMPOSER_MAX_PX = 200;
/** Bounds for a height she sets by hand, which may exceed the auto-grow cap. */
const COMPOSER_MIN_PX = 40;
const COMPOSER_DRAG_MAX_PX = 420;

const clampComposer = (px: number) =>
  Math.min(Math.max(px, COMPOSER_MIN_PX), COMPOSER_DRAG_MAX_PX);

export default function CopilotPanel() {
  const { isOpen, toggle, pageContext } = useCopilot();
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [streaming, setStreaming] = useState(false);
  const [conversationId, setConversationId] = useState<string | null>(null);
  const [pending, setPending] = useState<PendingAttachment[]>([]);
  const [attachError, setAttachError] = useState<string | null>(null);
  const [dragging, setDragging] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const bottomRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  // null = follow the content. A number = she dragged the handle, and that
  // choice outranks auto-grow until she double-clicks to hand it back. Pinning
  // the composer open is the point — auto-grow shrinks again the moment she
  // sends, which is wrong if she is working through a long paste.
  const [composerHeight, setComposerHeight] = useState<number | null>(null);
  const resizeRef = useRef<{ startY: number; startHeight: number } | null>(null);
  // In-flight stream, so "New" can cancel it. Without this, clicking New while
  // streaming emptied `messages` while the read loop kept appending to
  // updated[length - 1] — undefined.content, a render-pass TypeError that
  // crashed the whole app (CopilotPanel lives in the root layout).
  const abortRef = useRef<AbortController | null>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  // Auto-grow the composer with its content, up to COMPOSER_MAX_PX, then scroll
  // internally. The className already carried min-h/max-h, but nothing ever set
  // `height`, so `rows={1}` pinned it at one line and the max-h was dead code.
  // Layout effect, not effect: measure and resize before paint, or the box
  // visibly flickers at one row on every keystroke that adds a line.
  useLayoutEffect(() => {
    const el = textareaRef.current;
    if (!el) return;

    if (composerHeight !== null) {
      // max-h-[200px] from the className would silently clamp anything she
      // drags past the auto-grow cap, so the inline max-height has to be
      // released for her height to mean what it says.
      el.style.maxHeight = "none";
      el.style.height = `${composerHeight}px`;
      return;
    }

    el.style.maxHeight = ""; // back to the class
    el.style.height = "auto"; // shrink first, or scrollHeight only ever grows
    el.style.height = `${Math.min(el.scrollHeight, COMPOSER_MAX_PX)}px`;
  }, [input, composerHeight]);

  // ── Resize handle ───
  // Pointer events rather than mouse: one code path covers trackpad, touch and
  // pen. Pointer capture keeps the drag alive when she moves faster than the
  // 12px handle, which is most drags.
  function startResize(e: React.PointerEvent<HTMLDivElement>) {
    const el = textareaRef.current;
    if (!el) return;
    e.preventDefault();
    e.currentTarget.setPointerCapture(e.pointerId);
    resizeRef.current = { startY: e.clientY, startHeight: el.offsetHeight };
  }

  function onResizeMove(e: React.PointerEvent<HTMLDivElement>) {
    const start = resizeRef.current;
    if (!start) return;
    // The composer grows upward, so dragging up (a smaller clientY) makes it
    // taller.
    setComposerHeight(clampComposer(start.startHeight + (start.startY - e.clientY)));
  }

  function endResize(e: React.PointerEvent<HTMLDivElement>) {
    resizeRef.current = null;
    if (e.currentTarget.hasPointerCapture(e.pointerId)) {
      e.currentTarget.releasePointerCapture(e.pointerId);
    }
  }

  function onResizeKeyDown(e: React.KeyboardEvent<HTMLDivElement>) {
    const el = textareaRef.current;
    if (!el) return;
    const STEP = 24;
    if (e.key === "ArrowUp" || e.key === "ArrowDown") {
      e.preventDefault();
      const from = composerHeight ?? el.offsetHeight;
      setComposerHeight(clampComposer(from + (e.key === "ArrowUp" ? STEP : -STEP)));
    } else if (e.key === "Escape" || e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      setComposerHeight(null);
    }
  }

  /** Take files from the picker, a drop, or a paste. */
  async function addFiles(files: FileList | File[]) {
    const incoming = Array.from(files);
    if (!incoming.length) return;

    const problems: string[] = [];
    const accepted: PendingAttachment[] = [];
    // The aggregate cap the route enforces (#696). rejectionReason() only knows
    // about one file at a time, so without this the picker happily accepts five
    // legal 4MB files — 20MB, well past MAX_TOTAL_BYTES — and the whole turn
    // 413s at send time with nothing said about which file to drop.
    let bytes = pending.reduce((n, a) => n + a.size, 0);

    for (const file of incoming) {
      if (pending.length + accepted.length >= MAX_ATTACHMENTS) {
        problems.push(`Only ${MAX_ATTACHMENTS} files at a time.`);
        break;
      }
      const reason = rejectionReason(file);
      if (reason) {
        problems.push(reason);
        continue;
      }
      if (bytes + file.size > MAX_TOTAL_BYTES) {
        problems.push(
          `${file.name} won't fit — attachments have to total under ${Math.round(
            MAX_TOTAL_BYTES / 1024 / 1024
          )}MB. Send this one in a separate message.`
        );
        continue;
      }
      try {
        accepted.push(await readAttachment(file));
        bytes += file.size;
      } catch {
        problems.push(`${file.name} could not be read.`);
      }
    }

    if (accepted.length) setPending((p) => [...p, ...accepted]);
    setAttachError(problems.length ? problems.join(" ") : null);
  }

  function removeAttachment(localId: string) {
    setPending((p) => p.filter((a) => a.localId !== localId));
  }

  /** Screenshots arrive as clipboard files with no filename worth keeping. */
  function handlePaste(e: React.ClipboardEvent) {
    const files = Array.from(e.clipboardData.files);
    if (!files.length) return;
    e.preventDefault();
    void addFiles(
      files.map((f) =>
        f.name && f.name !== "image.png"
          ? f
          : new File([f], `pasted-${new Date().toISOString().slice(11, 19).replace(/:/g, "")}.png`, {
              type: f.type,
            })
      )
    );
  }

  async function send() {
    const text = input.trim();
    // An attachment on its own is a legitimate turn — "what do you make of
    // this?" is implied by dropping a file in.
    if ((!text && pending.length === 0) || streaming) return;

    const outgoing = pending;
    const userMessage: Message = {
      role: "user",
      content: text,
      attachments: outgoing.length ? outgoing.map((a) => a.name) : undefined,
    };
    const nextMessages = [...messages, userMessage];
    setMessages(nextMessages);
    setInput("");
    setPending([]);
    setAttachError(null);
    setStreaming(true);

    setMessages((prev) => [...prev, { role: "assistant", content: "" }]);

    const abort = new AbortController();
    abortRef.current = abort;

    try {
      const res = await fetch("/api/copilot", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        signal: abort.signal,
        body: JSON.stringify({
          // The panel's own Message shape carries a filename list for display;
          // the API wants plain role/content plus the attachment payloads.
          messages: nextMessages.map(({ role, content }) => ({ role, content })),
          conversationId,
          context: pageContext || undefined,
          attachments: outgoing.length
            ? outgoing.map(({ localId: _localId, ...a }) => a)
            : undefined,
        }),
      });

      if (!res.ok || !res.body) {
        // The route's 413s and 403s carry text worth reading ("start a new
        // conversation"). Swallowing them for a generic apology is what made
        // this failure impossible to act on.
        throw new Error(await errorDetail(res));
      }

      const newConvId = res.headers.get("X-Conversation-Id");
      if (newConvId && !conversationId) {
        setConversationId(newConvId);
      }

      const reader = res.body.getReader();
      const decoder = new TextDecoder();

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        const chunk = decoder.decode(value, { stream: true });
        setMessages((prev) => {
          // Guard against racing a conversation reset: if messages were
          // cleared (or the tail isn't the assistant placeholder), drop the
          // late chunk instead of crashing on undefined.
          if (prev.length === 0 || prev[prev.length - 1].role !== "assistant") {
            return prev;
          }
          const updated = [...prev];
          const last = updated[updated.length - 1];
          updated[updated.length - 1] = {
            ...last,
            content: last.content + chunk,
          };
          return updated;
        });
      }
    } catch (err) {
      // A deliberate abort (New conversation) is not an error.
      if (!(err instanceof DOMException && err.name === "AbortError")) {
        const detail =
          err instanceof Error && err.message
            ? err.message
            : "Something went wrong. Please try again.";
        setMessages((prev) => {
          if (prev.length === 0 || prev[prev.length - 1].role !== "assistant") {
            return prev;
          }
          const updated = [...prev];
          const last = updated[updated.length - 1];
          // Keep whatever streamed before the failure. A half-written unit map
          // is worth more than a generic apology, and losing it is what made a
          // mid-stream timeout indistinguishable from an outright rejection.
          // (`curriculum/page.tsx` already does this.)
          updated[updated.length - 1] = {
            ...last,
            content: last.content
              ? `${last.content}\n\n---\n\n_${detail} The partial answer above is what came through._`
              : `_${detail}_`,
          };
          return updated;
        });
      }
    } finally {
      if (abortRef.current === abort) abortRef.current = null;
      setStreaming(false);
    }
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      send();
    }
  }

  function newConversation() {
    abortRef.current?.abort();
    abortRef.current = null;
    setMessages([]);
    setConversationId(null);
    setStreaming(false);
  }

  return (
    <div
      className="fixed top-0 h-full z-40 flex flex-col bg-white dark:bg-zinc-950 border-l border-zinc-200 dark:border-zinc-800 shadow-xl transition-[right] duration-300 ease-in-out"
      style={{ width: "42%", right: isOpen ? "0%" : "-44%" }}
    >
      {/* Header */}
      <div className="border-b border-zinc-200 dark:border-zinc-800 px-4 py-3 flex items-center justify-between shrink-0">
        <div className="flex items-center gap-3">
          <h2 className="text-sm font-semibold text-zinc-900 dark:text-zinc-50">
            Copilot
          </h2>
          {pageContext && (
            <span className="text-xs text-zinc-400 truncate max-w-[200px]" title={pageContext}>
              {pageContext.split(",")[0]}
            </span>
          )}
        </div>
        <div className="flex items-center gap-2">
          {messages.length > 0 && (
            <button
              onClick={newConversation}
              className="text-xs text-zinc-400 hover:text-zinc-700 dark:hover:text-zinc-300 transition-colors"
            >
              New
            </button>
          )}
          <button
            onClick={toggle}
            className="text-zinc-400 hover:text-zinc-700 dark:hover:text-zinc-300 transition-colors p-1"
          >
            <svg width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M1 1l12 12M13 1L1 13" />
            </svg>
          </button>
        </div>
      </div>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto px-4 py-4 space-y-3 min-h-0">
        {messages.length === 0 && (
          <div className="flex flex-col items-center justify-center h-full gap-2 text-center text-zinc-400 dark:text-zinc-600">
            <p className="text-sm">Ask about your curriculum,</p>
            <p className="text-sm">standards, or lessons...</p>
          </div>
        )}
        {messages.map((msg, i) => (
          <div
            key={i}
            className={`flex ${msg.role === "user" ? "justify-end" : "justify-start"}`}
          >
            <div
              className={`max-w-[85%] rounded-xl px-3 py-2 text-sm leading-relaxed ${
                msg.role === "user"
                  ? "bg-zinc-900 text-white dark:bg-zinc-100 dark:text-zinc-900"
                  : "bg-zinc-50 text-zinc-900 border border-zinc-200 dark:bg-zinc-900 dark:text-zinc-100 dark:border-zinc-800"
              }`}
            >
              {msg.role === "assistant" ? (
                <div className="prose prose-zinc dark:prose-invert prose-sm max-w-none [&_table]:text-xs [&_th]:px-2 [&_td]:px-2 [&_th]:py-1 [&_td]:py-1">
                  <ReactMarkdown
                    remarkPlugins={[remarkGfm]}
                    components={{
                      pre: ({ children, ...props }) => {
                        const raw = draftFromPreChildren(children);
                        if (raw) {
                          const draft = parseDraftBlock(raw);
                          if (draft) {
                            return (
                              <DraftCard
                                draft={draft}
                                conversationId={conversationId}
                                streaming={streaming && i === messages.length - 1}
                              />
                            );
                          }
                        }
                        return <pre {...props}>{children}</pre>;
                      },
                    }}
                  >{msg.content}</ReactMarkdown>
                  {streaming && i === messages.length - 1 && (
                    <span className="inline-block w-1.5 h-4 ml-0.5 bg-zinc-400 animate-pulse align-middle" />
                  )}
                </div>
              ) : (
                <span className="whitespace-pre-wrap">
                  {msg.content}
                  {msg.attachments?.length ? (
                    <span className="mt-1 block text-xs opacity-70">
                      📎 {msg.attachments.join(", ")}
                    </span>
                  ) : null}
                </span>
              )}
            </div>
          </div>
        ))}
        <div ref={bottomRef} />
      </div>

      {/* Input. Dropping anywhere on this footer attaches. */}
      <div
        className={`border-t px-4 py-3 shrink-0 transition-colors ${
          dragging
            ? "border-zinc-400 dark:border-zinc-500 bg-zinc-100 dark:bg-zinc-800/60"
            : "border-zinc-200 dark:border-zinc-800"
        }`}
        onDragOver={(e) => {
          e.preventDefault();
          if (!streaming) setDragging(true);
        }}
        onDragLeave={() => setDragging(false)}
        onDrop={(e) => {
          e.preventDefault();
          setDragging(false);
          if (!streaming) void addFiles(e.dataTransfer.files);
        }}
      >
        {/* Resize handle. Auto-grow covers the common case; this is for
            pinning the box open while she works through something long, which
            auto-grow undoes on every send. Double-click (or Enter/Escape when
            focused) gives the height back to the content. */}
        <div
          role="separator"
          aria-orientation="horizontal"
          aria-label="Resize the message box. Arrow keys adjust, Enter restores automatic height."
          tabIndex={0}
          onPointerDown={startResize}
          onPointerMove={onResizeMove}
          onPointerUp={endResize}
          onPointerCancel={endResize}
          onDoubleClick={() => setComposerHeight(null)}
          onKeyDown={onResizeKeyDown}
          title={
            composerHeight === null
              ? "Drag to set a height"
              : "Drag to resize — double-click to fit the text again"
          }
          className="group -mt-1.5 mb-1.5 flex h-3 w-full cursor-ns-resize touch-none items-center justify-center rounded focus:outline-none focus:ring-1 focus:ring-zinc-400 dark:focus:ring-zinc-500"
        >
          <div
            className={`h-[3px] w-8 rounded-full transition-colors ${
              composerHeight === null
                ? "bg-zinc-200 group-hover:bg-zinc-400 dark:bg-zinc-700 dark:group-hover:bg-zinc-500"
                : "bg-zinc-400 dark:bg-zinc-500"
            }`}
          />
        </div>

        {pending.length > 0 && (
          <ul className="flex flex-wrap gap-1.5 mb-2">
            {pending.map((a) => (
              <li
                key={a.localId}
                className="flex items-center gap-1.5 rounded-md bg-zinc-100 dark:bg-zinc-800 px-2 py-1 text-xs text-zinc-700 dark:text-zinc-300"
              >
                <span aria-hidden="true">
                  {a.kind === "image" ? "🖼" : a.kind === "pdf" ? "📄" : "📝"}
                </span>
                <span className="max-w-[160px] truncate">{a.name}</span>
                <button
                  type="button"
                  onClick={() => removeAttachment(a.localId)}
                  aria-label={`Remove ${a.name}`}
                  className="text-zinc-400 hover:text-zinc-700 dark:hover:text-zinc-200"
                >
                  ×
                </button>
              </li>
            ))}
          </ul>
        )}

        {attachError && (
          <p className="mb-2 text-xs text-amber-700 dark:text-amber-400">{attachError}</p>
        )}

        <div className="flex gap-2 items-end">
          <input
            ref={fileInputRef}
            type="file"
            multiple
            accept={ACCEPT_ATTR}
            className="hidden"
            onChange={(e) => {
              if (e.target.files) void addFiles(e.target.files);
              e.target.value = ""; // so the same file can be picked twice
            }}
          />
          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            disabled={streaming || pending.length >= MAX_ATTACHMENTS}
            title="Attach a file — or drag one in, or paste a screenshot"
            aria-label="Attach a file"
            className="h-10 w-10 shrink-0 rounded-lg border border-zinc-300 dark:border-zinc-700 text-zinc-600 dark:text-zinc-300 hover:bg-zinc-100 dark:hover:bg-zinc-800 disabled:opacity-40"
          >
            +
          </button>
          <textarea
            ref={textareaRef}
            className="flex-1 resize-none overflow-y-auto rounded-lg border border-zinc-300 dark:border-zinc-700 bg-zinc-50 dark:bg-zinc-800 px-3 py-2 text-sm leading-relaxed text-zinc-900 dark:text-zinc-100 placeholder-zinc-400 focus:outline-none focus:ring-1 focus:ring-zinc-400 dark:focus:ring-zinc-500 min-h-[40px] max-h-[200px]"
            placeholder={dragging ? "Drop it here…" : "Ask your copilot..."}
            rows={1}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            onPaste={handlePaste}
            disabled={streaming}
          />
          <button
            onClick={send}
            disabled={(!input.trim() && pending.length === 0) || streaming}
            className="h-10 px-4 rounded-lg bg-zinc-900 dark:bg-zinc-100 text-white dark:text-zinc-900 text-sm font-medium disabled:opacity-40 hover:bg-zinc-700 dark:hover:bg-zinc-300 transition-colors shrink-0"
          >
            Send
          </button>
        </div>
      </div>
    </div>
  );
}
