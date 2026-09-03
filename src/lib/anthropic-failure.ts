// Classify an Anthropic API failure into the one question that matters
// operationally: is this a transient blip, or is the ACCOUNT the problem?
//
// Context (2026-09-03): ai-teacher's ANTHROPIC_API_KEY belongs to Jason's older
// hotmail org, funded by a one-time $10 that has lasted since April. The
// decision was to ride it until it runs out rather than migrate pre-emptively —
// so the moment it runs out must be unmistakable, not a generic "try again".
// Anthropic has no balance endpoint; the first signal IS the failed call.
//
// Signatures, from the API's own error bodies:
//   400  "Your credit balance is too low to access the Anthropic API."
//   401  "invalid x-api-key"            (key revoked or wrong)
//   403  permission_error               (key disabled / org suspended)
//
// Everything else (429, 5xx, network) is transient and stays generic.


export type AnthropicFailureKind =
  | "billing_exhausted"
  | "key_invalid"
  | "transient"
  | "unknown";

export interface AnthropicFailure {
  kind: AnthropicFailureKind;
  status?: number;
  /** The API's own sentence, for the error_events row. Never shown to the teacher verbatim. */
  apiMessage?: string;
  /** What the teacher should see. */
  userMessage: string;
  /** Whether this needs a human (Jason) to do something before the app works again. */
  needsOperator: boolean;
}

const BILLING_RE = /credit balance|insufficient.*credit|billing|out of credits|exceeded your.*budget/i;
const KEY_RE = /invalid.*api.key|x-api-key|authentication_error|api key.*(invalid|revoked|disabled)/i;

const OPERATOR_NOTE =
  " Jason has been notified automatically; nothing on your side needs to change.";

/**
 * Shape of the SDK's APIError we rely on. Duck-typed rather than
 * `instanceof Anthropic.APIError`: tests mock the SDK module (making the class
 * undefined), and a future SDK major could move it. `status` + a body is all
 * the classification needs.
 */
interface ApiErrorLike {
  status?: number;
  error?: { error?: { message?: string }; message?: string };
  message?: string;
}

function isApiErrorLike(err: unknown): err is ApiErrorLike {
  return (
    typeof err === "object" &&
    err !== null &&
    typeof (err as ApiErrorLike).status === "number" &&
    ("error" in err || "message" in err)
  );
}

export function classifyAnthropicFailure(err: unknown): AnthropicFailure {
  if (!isApiErrorLike(err)) {
    return {
      kind: "unknown",
      userMessage: "The AI didn't answer just now. Try again in a moment.",
      needsOperator: false,
    };
  }
  const status = err.status;
  const apiMessage = extractMessage(err);

  if (status === 400 && BILLING_RE.test(apiMessage)) {
    return {
      kind: "billing_exhausted",
      status,
      apiMessage,
      userMessage:
        "The AI service's prepaid credits have run out, so this feature is paused." + OPERATOR_NOTE,
      needsOperator: true,
    };
  }
  if (status === 401 || status === 403 || KEY_RE.test(apiMessage)) {
    return {
      kind: "key_invalid",
      status,
      apiMessage,
      userMessage:
        "The AI service rejected this app's access key, so this feature is paused." + OPERATOR_NOTE,
      needsOperator: true,
    };
  }
  if (status === 429 || status === 529 || (status !== undefined && status >= 500)) {
    return {
      kind: "transient",
      status,
      apiMessage,
      userMessage: "The AI is busy right now. Try again in a minute.",
      needsOperator: false,
    };
  }
  return {
    kind: "unknown",
    status,
    apiMessage,
    userMessage: "The AI didn't answer just now. Try again in a moment.",
    needsOperator: false,
  };
}

function extractMessage(err: ApiErrorLike): string {
  // The SDK surfaces the body as `error` ({ type, error: { type, message } }).
  return err.error?.error?.message ?? err.error?.message ?? err.message ?? "";
}

/**
 * The Sentry event title for an operator-needed failure. Deliberately a
 * sentence with the fix in it: the alert email is the runbook's first line.
 */
export function operatorAlertTitle(f: AnthropicFailure): string {
  switch (f.kind) {
    case "billing_exhausted":
      return "ACTION NEEDED: Anthropic credits exhausted — switch ANTHROPIC_API_KEY to the jaetill org (docs/runbooks/ai-billing.md)";
    case "key_invalid":
      return "ACTION NEEDED: Anthropic rejected ANTHROPIC_API_KEY — mint a new key in the jaetill org (docs/runbooks/ai-billing.md)";
    default:
      return `Anthropic API failure (${f.kind})`;
  }
}
