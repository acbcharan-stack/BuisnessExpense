/**
 * Turns the many ways an extraction can fail into (a) a retry decision and
 * (b) a short, human-readable message that is safe to show in the UI.
 *
 * Raw provider errors (e.g. Google's `{"error":{"code":503,...}}` JSON blob)
 * must never reach the screen or the `documents.error` column: they are noise
 * to the user and can leak internals. Pure module — no server-only imports — so
 * the Inbox page can also use it to tidy rows saved before this existed.
 */

export type FailureKind = "transient" | "permanent";

export interface ClassifiedFailure {
  kind: FailureKind;
  /** Safe for the UI. */
  message: string;
  /** Truncated technical detail, for the job row / server logs only. */
  detail: string;
}

/** An error whose message is already user-safe and whose retry-ability is known. */
export class ExtractionError extends Error {
  readonly kind: FailureKind;
  constructor(message: string, kind: FailureKind = "transient") {
    super(message);
    this.name = "ExtractionError";
    this.kind = kind;
  }
}

const MESSAGES = {
  busy: "The AI service is busy right now — your file is safe. Press Retry in a minute.",
  rateLimited:
    "The AI service is receiving too many requests. Your file is safe — press Retry shortly.",
  timeout: "The AI service took too long to respond. Press Retry to try again.",
  network: "Could not reach the AI service. Check the connection and press Retry.",
  badKey:
    "The AI service rejected our credentials. An admin needs to check GEMINI_API_KEY.",
  rejected:
    "The AI service could not accept this file. Try re-scanning it or entering it manually.",
  unreadable:
    "The AI could not read this document cleanly. Press Retry, or enter it manually.",
  generic: "Something went wrong while processing this document. Press Retry.",
} as const;

const MAX_DETAIL = 500;

function fromStatus(status: number): Pick<ClassifiedFailure, "kind" | "message"> {
  if (status === 429) return { kind: "transient", message: MESSAGES.rateLimited };
  if (status === 408 || status === 504) {
    return { kind: "transient", message: MESSAGES.timeout };
  }
  if (status >= 500) return { kind: "transient", message: MESSAGES.busy };
  if (status === 401 || status === 403) {
    return { kind: "permanent", message: MESSAGES.badKey };
  }
  if (status >= 400) return { kind: "permanent", message: MESSAGES.rejected };
  return { kind: "transient", message: MESSAGES.generic };
}

/** Pulls an HTTP-ish status out of a provider error string (JSON or partial JSON). */
function statusFromText(text: string): number | null {
  try {
    const parsed: unknown = JSON.parse(text);
    if (parsed && typeof parsed === "object") {
      const err = (parsed as { error?: { code?: unknown } }).error;
      if (err && typeof err.code === "number") return err.code;
    }
  } catch {
    /* fall through to the regex — stored text may be truncated JSON */
  }
  const m = text.match(/"code"\s*:\s*(\d{3})/);
  return m ? Number(m[1]) : null;
}

/**
 * The provider's own one-line reason (e.g. "The document has no pages"), made
 * safe to show: control characters removed, whitespace collapsed, length capped.
 * Only used for "your file was rejected" errors, where the reason is what lets
 * someone fix the file.
 */
function providerReason(raw: string): string | null {
  try {
    const parsed: unknown = JSON.parse(raw);
    const msg = (parsed as { error?: { message?: unknown } } | null)?.error?.message;
    if (typeof msg !== "string") return null;
    const clean = msg
      .replace(/[\u0000-\u001f\u007f]/g, " ")
      .replace(/\s+/g, " ")
      .trim()
      .slice(0, 160);
    return clean || null;
  } catch {
    return null;
  }
}

const NETWORK_RE =
  /fetch failed|econnreset|econnrefused|enotfound|etimedout|socket hang up|network/i;

export function classifyExtractionError(err: unknown): ClassifiedFailure {
  if (err instanceof ExtractionError) {
    return { kind: err.kind, message: err.message, detail: err.message };
  }

  const raw = err instanceof Error ? err.message : String(err);
  const detail = raw.slice(0, MAX_DETAIL);

  if (err instanceof Error && (err.name === "AbortError" || err.name === "TimeoutError")) {
    return { kind: "transient", message: MESSAGES.timeout, detail };
  }

  // `@google/genai` ApiError carries a numeric `status`.
  const status =
    err && typeof err === "object" && typeof (err as { status?: unknown }).status === "number"
      ? (err as { status: number }).status
      : statusFromText(raw);
  if (status !== null) {
    const base = fromStatus(status);
    if (base.message === MESSAGES.rejected) {
      const reason = providerReason(raw);
      if (reason) return { ...base, message: `${MESSAGES.rejected} Reason given: ${reason}`, detail };
    }
    return { ...base, detail };
  }

  if (err instanceof Error && err.name === "ZodError") {
    return { kind: "transient", message: MESSAGES.unreadable, detail };
  }
  if (NETWORK_RE.test(raw)) {
    return { kind: "transient", message: MESSAGES.network, detail };
  }
  return { kind: "transient", message: MESSAGES.generic, detail };
}

/**
 * Cleans an error string read back from the database. Rows written before
 * classification existed hold raw provider JSON; newer rows are already friendly.
 */
export function friendlyStoredError(stored: string | null | undefined): string | null {
  if (!stored) return null;
  const text = stored.trim();
  if (!text) return null;
  if (text.startsWith("{") || /"code"\s*:\s*\d{3}/.test(text)) {
    const status = statusFromText(text);
    return status !== null ? fromStatus(status).message : MESSAGES.generic;
  }
  return text.slice(0, 300);
}
