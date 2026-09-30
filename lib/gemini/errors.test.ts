import { describe, expect, it } from "vitest";
import {
  classifyExtractionError,
  ExtractionError,
  friendlyStoredError,
} from "./errors";

const RAW_503 =
  '{"error":{"code":503,"message":"This model is currently experiencing high demand. Spikes in demand are usually temporary. Please try again later.","status":"UNAVAILABLE"}}';

const withStatus = (status: number) => Object.assign(new Error("x"), { status });

describe("classifyExtractionError", () => {
  it("treats a 503 from the SDK as transient and hides the raw JSON", () => {
    const out = classifyExtractionError(
      Object.assign(new Error(RAW_503), { status: 503 }),
    );
    expect(out.kind).toBe("transient");
    expect(out.message).not.toContain("{");
    expect(out.message).toMatch(/busy/i);
  });

  it("reads the status out of the JSON when there is no status property", () => {
    expect(classifyExtractionError(new Error(RAW_503)).kind).toBe("transient");
  });

  it("treats rate limits and timeouts as transient", () => {
    expect(classifyExtractionError(withStatus(429)).kind).toBe("transient");
    expect(classifyExtractionError(withStatus(504)).kind).toBe("transient");
    const abort = new Error("aborted");
    abort.name = "AbortError";
    expect(classifyExtractionError(abort).kind).toBe("transient");
  });

  it("treats auth and bad-request errors as permanent", () => {
    expect(classifyExtractionError(withStatus(403)).kind).toBe("permanent");
    expect(classifyExtractionError(withStatus(400)).kind).toBe("permanent");
  });

  it("recognises network failures", () => {
    const out = classifyExtractionError(new TypeError("fetch failed"));
    expect(out.kind).toBe("transient");
    expect(out.message).toMatch(/reach/i);
  });

  it("passes our own errors through and never leaks unknown ones", () => {
    expect(
      classifyExtractionError(new ExtractionError("Nope.", "permanent")),
    ).toMatchObject({ kind: "permanent", message: "Nope." });
    const out = classifyExtractionError(
      new Error('relation "secret_table" does not exist'),
    );
    expect(out.message).not.toContain("secret_table");
  });

  it("caps the technical detail", () => {
    expect(
      classifyExtractionError(new Error("x".repeat(5000))).detail.length,
    ).toBeLessThanOrEqual(500);
  });
});

describe("friendlyStoredError", () => {
  it("rewrites raw provider JSON saved by older runs", () => {
    expect(friendlyStoredError(RAW_503)).toMatch(/busy/i);
    expect(friendlyStoredError(RAW_503.slice(0, 60))).not.toContain("{");
  });

  it("leaves already-friendly text alone and handles empties", () => {
    expect(friendlyStoredError("Press Retry.")).toBe("Press Retry.");
    expect(friendlyStoredError(null)).toBeNull();
    expect(friendlyStoredError("   ")).toBeNull();
  });
});
