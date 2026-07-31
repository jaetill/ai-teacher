// Shared fenced-JSON parser for AI responses (#612).
//
// Models sometimes wrap JSON in ```json fences or add stray prose despite
// being told not to. Slice to the outermost JSON value (object or array) and
// parse that. Returns null on failure — callers keep their route-specific
// error responses. Hoisted from build-curriculum, which had the robust
// version while classify / infer-standards / link-materials all had a fragile
// bare JSON.parse.

export function parseAiJson<T>(text: string): T | null {
  const firstObj = text.indexOf("{");
  const firstArr = text.indexOf("[");
  // The outermost value starts at whichever bracket appears first.
  let start = -1;
  let open: "{" | "[" = "{";
  if (firstObj !== -1 && (firstArr === -1 || firstObj < firstArr)) {
    start = firstObj;
    open = "{";
  } else if (firstArr !== -1) {
    start = firstArr;
    open = "[";
  }
  const end = text.lastIndexOf(open === "{" ? "}" : "]");

  const candidate =
    start !== -1 && end > start ? text.slice(start, end + 1) : text;

  try {
    return JSON.parse(candidate) as T;
  } catch {
    return null;
  }
}
