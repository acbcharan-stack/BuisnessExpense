import { describe, expect, it } from "vitest";
import {
  SOCIAL_MAX_FILE_BYTES,
  SOCIAL_STORED_NAME_RE,
  checkSocialFile,
  formatBytes,
  isSocialMime,
  mimeForFile,
  socialKindFor,
} from "./social";

describe("isSocialMime / socialKindFor", () => {
  it("accepts the supported image and video types", () => {
    expect(socialKindFor("image/jpeg")).toBe("image");
    expect(socialKindFor("image/gif")).toBe("image");
    expect(socialKindFor("video/mp4")).toBe("video");
    expect(socialKindFor("video/quicktime")).toBe("video");
  });

  it("rejects everything else, including tricky names", () => {
    for (const bad of [
      "text/html",
      "application/pdf",
      "image/svg+xml",
      "image/heic",
      "",
      "constructor",
      "__proto__",
      "toString",
    ]) {
      expect(isSocialMime(bad)).toBe(false);
      expect(socialKindFor(bad)).toBeNull();
    }
    expect(isSocialMime(undefined)).toBe(false);
    expect(isSocialMime(42)).toBe(false);
  });
});

describe("SOCIAL_STORED_NAME_RE", () => {
  const id = "3f2b8c1e-9d4a-4c7e-8a51-0b6e2d9f1a77";

  it("accepts <uuid>.<allowed extension>", () => {
    for (const ext of ["jpg", "png", "webp", "gif", "mp4", "webm", "mov"]) {
      expect(SOCIAL_STORED_NAME_RE.test(`${id}.${ext}`)).toBe(true);
    }
  });

  it("rejects path tricks, odd extensions and extra segments", () => {
    for (const bad of [
      `${id}.html`,
      `${id}.jpg.html`,
      `../${id}.jpg`,
      `${id}/x.jpg`,
      `${id}.JPG.exe`,
      "evil.jpg",
      `${id}.jpg\n`,
      "",
    ]) {
      expect(SOCIAL_STORED_NAME_RE.test(bad)).toBe(false);
    }
  });
});

describe("checkSocialFile", () => {
  it("passes a normal photo", () => {
    expect(
      checkSocialFile({ name: "a.jpg", type: "image/jpeg", size: 2_000_000 }),
    ).toBeNull();
  });

  it("flags a wrong type, an empty file and an oversized file", () => {
    expect(
      checkSocialFile({ name: "a.pdf", type: "application/pdf", size: 10 }),
    ).toMatch(/only JPG/);
    expect(
      checkSocialFile({ name: "a.jpg", type: "image/jpeg", size: 0 }),
    ).toMatch(/empty/);
    expect(
      checkSocialFile({
        name: "big.mp4",
        type: "video/mp4",
        size: SOCIAL_MAX_FILE_BYTES + 1,
      }),
    ).toMatch(/larger than/);
  });
});

describe("mimeForFile", () => {
  it("prefers a recognised browser-reported type", () => {
    expect(mimeForFile({ name: "clip.mp4", type: "video/mp4" })).toBe("video/mp4");
  });

  it("falls back to the extension when the type is empty", () => {
    expect(mimeForFile({ name: "clip.MOV", type: "" })).toBe("video/quicktime");
    expect(mimeForFile({ name: "photo.jpeg", type: "" })).toBe("image/jpeg");
  });

  it("returns empty for anything unrecognised", () => {
    expect(mimeForFile({ name: "doc.pdf", type: "application/pdf" })).toBe("");
    expect(mimeForFile({ name: "noext", type: "" })).toBe("");
    expect(mimeForFile({ name: "x.constructor", type: "" })).toBe("");
  });
});

describe("formatBytes", () => {
  it("formats bytes, KB and MB", () => {
    expect(formatBytes(512)).toBe("512 B");
    expect(formatBytes(2048)).toBe("2 KB");
    expect(formatBytes(5 * 1024 * 1024)).toBe("5.0 MB");
    expect(formatBytes(-1)).toBe("");
  });
});
