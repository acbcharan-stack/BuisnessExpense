import { describe, expect, it } from "vitest";
import {
  addCommentSchema,
  prepareUploadSchema,
  publishPostSchema,
  stripControlChars,
} from "./form-schema";

const postId = "3f2b8c1e-9d4a-4c7e-8a51-0b6e2d9f1a77";
const fileName = "8a1d2c3e-4b5f-4a6b-9c7d-0e1f2a3b4c5d.jpg";

describe("stripControlChars", () => {
  it("removes invisible control characters but keeps newlines, returns and tabs", () => {
    const nul = String.fromCharCode(0);
    const bell = String.fromCharCode(7);
    const del = String.fromCharCode(127);
    expect(stripControlChars(`a${nul}b\tc\nd\r${bell}e${del}f`)).toBe("ab\tc\nd\ref");
  });
});

describe("prepareUploadSchema", () => {
  it("accepts a normal request", () => {
    const r = prepareUploadSchema.safeParse({
      files: [
        { type: "image/jpeg", size: 1234 },
        { type: "video/mp4", size: 40 * 1024 * 1024 },
      ],
    });
    expect(r.success).toBe(true);
  });

  it("rejects no files, too many files, bad types and bad sizes", () => {
    const ok = { type: "image/png", size: 10 };
    expect(prepareUploadSchema.safeParse({ files: [] }).success).toBe(false);
    expect(
      prepareUploadSchema.safeParse({ files: Array(11).fill(ok) }).success,
    ).toBe(false);
    expect(
      prepareUploadSchema.safeParse({ files: [{ type: "text/html", size: 10 }] })
        .success,
    ).toBe(false);
    expect(
      prepareUploadSchema.safeParse({ files: [{ type: "image/png", size: 0 }] })
        .success,
    ).toBe(false);
    expect(
      prepareUploadSchema.safeParse({
        files: [{ type: "image/png", size: 51 * 1024 * 1024 }],
      }).success,
    ).toBe(false);
    expect(
      prepareUploadSchema.safeParse({ files: [{ type: "image/png", size: 1.5 }] })
        .success,
    ).toBe(false);
  });
});

describe("publishPostSchema", () => {
  const base = {
    postId,
    title: "  Launch post  ",
    caption: "  ",
    files: [{ name: fileName, original_name: "IMG_0001.jpg" }],
  };

  it("trims the title and turns a blank caption into null", () => {
    const r = publishPostSchema.parse(base);
    expect(r.title).toBe("Launch post");
    expect(r.caption).toBeNull();
  });

  it("rejects a blank title, a bad post id and a hostile file name", () => {
    expect(publishPostSchema.safeParse({ ...base, title: "   " }).success).toBe(false);
    expect(publishPostSchema.safeParse({ ...base, postId: "nope" }).success).toBe(false);
    for (const name of [
      "../secret.jpg",
      `${postId}/${fileName}`,
      "evil.html",
      fileName + ".exe",
    ]) {
      expect(
        publishPostSchema.safeParse({
          ...base,
          files: [{ name, original_name: "x" }],
        }).success,
      ).toBe(false);
    }
  });

  it("caps title and caption length", () => {
    expect(
      publishPostSchema.safeParse({ ...base, title: "x".repeat(121) }).success,
    ).toBe(false);
    expect(
      publishPostSchema.safeParse({ ...base, caption: "x".repeat(2001) }).success,
    ).toBe(false);
  });
});

describe("addCommentSchema", () => {
  it("accepts a comment and a suggestion", () => {
    for (const kind of ["comment", "suggestion"] as const) {
      expect(addCommentSchema.safeParse({ postId, kind, body: "Nice" }).success).toBe(
        true,
      );
    }
  });

  it("rejects an empty body, an unknown kind and an over-long body", () => {
    expect(
      addCommentSchema.safeParse({ postId, kind: "comment", body: "   " }).success,
    ).toBe(false);
    expect(
      addCommentSchema.safeParse({ postId, kind: "admin", body: "hi" }).success,
    ).toBe(false);
    expect(
      addCommentSchema.safeParse({ postId, kind: "comment", body: "x".repeat(2001) })
        .success,
    ).toBe(false);
  });
});
