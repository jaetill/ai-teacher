// Client-side signal that new materials just landed (#650).
//
// The import flows (Drive copy, computer upload) dispatch this after a
// successful batch; SummarizeMaterials listens and auto-runs the summary pass
// so fresh imports become AI-indexed without a second click. The manual
// button remains as the fallback for the backlog and for retries. A window
// event keeps the two components decoupled — the import components don't know
// summarization exists, and future import paths just call announce.

export const MATERIALS_IMPORTED_EVENT = "ai-teacher:materials-imported";

export function announceMaterialsImported(): void {
  if (typeof window !== "undefined") {
    window.dispatchEvent(new Event(MATERIALS_IMPORTED_EVENT));
  }
}
