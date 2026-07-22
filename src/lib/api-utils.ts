// Shared request-parsing/validation helpers for API routes.
//
// Every route that accepts a body should parse it with readJson() (malformed
// JSON is a client error → 400, not an uncaught SyntaxError → 500), and every
// route that accepts an entity id should gate it with isUuid() before it
// reaches Postgres (a non-UUID string throws `invalid input syntax for type
// uuid` from the driver, which also surfaces as an uncaught 500).

export const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function isUuid(value: unknown): value is string {
  return typeof value === "string" && UUID_RE.test(value);
}

/**
 * Parse a JSON request body, returning null on malformed/empty input instead
 * of throwing. Callers should treat null as a 400.
 */
export async function readJson<T>(req: Request): Promise<T | null> {
  try {
    return (await req.json()) as T;
  } catch {
    return null;
  }
}
