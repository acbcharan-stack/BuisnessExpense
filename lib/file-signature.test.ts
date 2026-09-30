import { describe, expect, it } from "vitest";
import { detectMimeType, sanitizeFilename } from "./file-signature";

const bytes = (...n: number[]) => new Uint8Array(n);
const text = (s: string) => new TextEncoder().encode(s);

describe("detectMimeType", () => {
  it("recognises real files by their leading bytes", () => {
    expect(detectMimeType(bytes(0xff, 0xd8, 0xff, 0xe0, 0, 0))).toBe("image/jpeg");
    expect(
      detectMimeType(bytes(0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0)),
    ).toBe("image/png");
    expect(detectMimeType(text("RIFF\0\0\0\0WEBPVP8 "))).toBe("image/webp");
    expect(detectMimeType(text("%PDF-1.7\n"))).toBe("application/pdf");
    expect(detectMimeType(text("\0\0\0\x18ftypheic"))).toBe("image/heic");
    expect(detectMimeType(text("\0\0\0\x18ftypmif1"))).toBe("image/heif");
  });

  it("accepts a PDF with junk before the header", () => {
    expect(detectMimeType(text("\r\n\r\n%PDF-1.4"))).toBe("application/pdf");
  });

  it("rejects disguised or unknown content", () => {
    expect(detectMimeType(text("MZ\x90\0 not an image"))).toBeNull();
    expect(detectMimeType(text("<script>alert(1)</script>"))).toBeNull();
    expect(detectMimeType(text("RIFF\0\0\0\0WAVEfmt "))).toBeNull();
    expect(detectMimeType(bytes())).toBeNull();
    expect(detectMimeType(bytes(0xff))).toBeNull();
  });
});

describe("sanitizeFilename", () => {
  it("keeps ordinary names", () => {
    expect(sanitizeFilename("Nitish Coir 20May26.pdf")).toBe("Nitish Coir 20May26.pdf");
  });

  it("strips path parts, control and special characters", () => {
    expect(sanitizeFilename("..\\..\\etc/passwd")).toBe("passwd");
    expect(sanitizeFilename('a<b>"c"|d?.pdf')).toBe("abcd.pdf");
    expect(sanitizeFilename("bad\u0000name\n.pdf")).toBe("badname.pdf");
    expect(sanitizeFilename(".hidden.pdf")).toBe("hidden.pdf");
  });

  it("falls back when nothing is left", () => {
    expect(sanitizeFilename("")).toBe("upload");
    expect(sanitizeFilename("???")).toBe("upload");
  });

  it("caps length but keeps the extension", () => {
    const out = sanitizeFilename("x".repeat(500) + ".pdf");
    expect(out.length).toBe(200);
    expect(out.endsWith(".pdf")).toBe(true);
  });
});
