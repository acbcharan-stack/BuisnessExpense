import type { ACCEPTED_MIME_TYPES } from "@/lib/constants";

export type AcceptedMime = (typeof ACCEPTED_MIME_TYPES)[number];

function startsWith(bytes: Uint8Array, sig: number[], offset = 0): boolean {
  if (bytes.length < offset + sig.length) return false;
  return sig.every((b, i) => bytes[offset + i] === b);
}

function ascii(bytes: Uint8Array, start: number, end: number): string {
  return String.fromCharCode(...bytes.subarray(start, end));
}

const HEIC_BRANDS = new Set(["heic", "heix", "hevc", "hevx", "heim", "heis"]);
const HEIF_BRANDS = new Set(["mif1", "msf1", "heif"]);

/**
 * Identifies the real file type from its first bytes ("magic numbers").
 *
 * The browser-supplied `File.type` is only a label the sender chose, so it can
 * claim `image/png` for an executable. We never trust it — we look inside the
 * file and only accept what actually is a JPEG / PNG / WebP / HEIC / PDF.
 */
export function detectMimeType(bytes: Uint8Array): AcceptedMime | null {
  if (startsWith(bytes, [0xff, 0xd8, 0xff])) return "image/jpeg";
  if (startsWith(bytes, [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])) {
    return "image/png";
  }
  if (
    startsWith(bytes, [0x52, 0x49, 0x46, 0x46]) && // "RIFF"
    startsWith(bytes, [0x57, 0x45, 0x42, 0x50], 8) // "WEBP"
  ) {
    return "image/webp";
  }
  if (bytes.length >= 12 && ascii(bytes, 4, 8) === "ftyp") {
    const brand = ascii(bytes, 8, 12);
    if (HEIC_BRANDS.has(brand)) return "image/heic";
    if (HEIF_BRANDS.has(brand)) return "image/heif";
  }
  // PDF readers tolerate a little junk before the header; the spec allows 1 KiB.
  const head = ascii(bytes, 0, Math.min(bytes.length, 1024));
  if (head.includes("%PDF-")) return "application/pdf";
  return null;
}

const MAX_FILENAME = 200;

/**
 * Makes a user-supplied filename safe to store and display: no path parts,
 * control characters or characters that are special in file systems / HTML
 * contexts, and a sane length (keeping the extension).
 */
export function sanitizeFilename(name: string): string {
  const base = name.normalize("NFC").split(/[\\/]/).pop() ?? "";
  const cleaned = base
    .replace(/[\u0000-\u001f\u007f<>:"|?*]/g, "")
    .replace(/\s+/g, " ")
    .replace(/^\.+/, "")
    .trim();
  if (!cleaned) return "upload";
  if (cleaned.length <= MAX_FILENAME) return cleaned;
  const dot = cleaned.lastIndexOf(".");
  const ext = dot > 0 && cleaned.length - dot <= 10 ? cleaned.slice(dot) : "";
  return cleaned.slice(0, MAX_FILENAME - ext.length) + ext;
}
