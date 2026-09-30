import { describe, expect, it } from "vitest";
import { finalizeUploadSchema, prepareUploadSchema } from "./direct-upload";

const UUID = "3f2b8c1e-9a4d-4e7b-8c5a-1d2e3f4a5b6c";

describe("prepareUploadSchema", () => {
  it("accepts an image within the size limit", () => {
    expect(
      prepareUploadSchema.safeParse({ filename: "a.jpg", type: "image/jpeg", size: 9_000_000 })
        .success,
    ).toBe(true);
  });

  it("rejects PDFs, oversize, empty, fractional and non-numeric sizes", () => {
    const base = { filename: "a", type: "image/png", size: 10 };
    expect(prepareUploadSchema.safeParse({ ...base, type: "application/pdf" }).success).toBe(false);
    expect(prepareUploadSchema.safeParse({ ...base, size: 26 * 1024 * 1024 }).success).toBe(false);
    expect(prepareUploadSchema.safeParse({ ...base, size: 0 }).success).toBe(false);
    expect(prepareUploadSchema.safeParse({ ...base, size: 1.5 }).success).toBe(false);
    expect(prepareUploadSchema.safeParse({ ...base, size: "10" }).success).toBe(false);
  });
});

describe("finalizeUploadSchema", () => {
  it("accepts only server-style names", () => {
    expect(finalizeUploadSchema.safeParse({ path: `${UUID}.png`, filename: "x" }).success).toBe(true);
  });

  it("rejects paths that could reach other files", () => {
    for (const path of [
      `../${UUID}.png`,
      `folder/${UUID}.png`,
      `${UUID}.pdf`,
      `${UUID}.png/../x`,
      "secret.png",
      `${UUID}.png\n`,
    ]) {
      expect(finalizeUploadSchema.safeParse({ path, filename: "x" }).success).toBe(false);
    }
  });
});
