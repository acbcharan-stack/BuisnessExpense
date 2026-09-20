/**
 * Rules for the Social Media Posts & Videos board, shared by the browser (for a
 * friendly early "that file won't work" message) and the server (which is the
 * one that actually enforces them — the browser can be lied to).
 */

export const SOCIAL_MAX_FILES = 10;
/** Per-file cap. The storage bucket enforces the same number independently. */
export const SOCIAL_MAX_FILE_BYTES = 50 * 1024 * 1024; // 50 MB
export const SOCIAL_TITLE_MAX = 120;
export const SOCIAL_CAPTION_MAX = 2000;
export const SOCIAL_COMMENT_MAX = 2000;
export const SOCIAL_PAGE_SIZE = 12;

/**
 * The only file types accepted. Note the file *extension* is never taken from
 * the uploaded name — it is looked up here from the declared type, so a file
 * called `evil.html` can never be stored as `.html`.
 *
 * HEIC/HEIF is left out on purpose: almost no browser can display it. iPhones
 * convert photos to JPEG automatically when a page only asks for these types.
 */
export const SOCIAL_MEDIA_TYPES = {
  "image/jpeg": { kind: "image", ext: "jpg" },
  "image/png": { kind: "image", ext: "png" },
  "image/webp": { kind: "image", ext: "webp" },
  "image/gif": { kind: "image", ext: "gif" },
  "video/mp4": { kind: "video", ext: "mp4" },
  "video/webm": { kind: "video", ext: "webm" },
  "video/quicktime": { kind: "video", ext: "mov" },
} as const;

export type SocialMime = keyof typeof SOCIAL_MEDIA_TYPES;
export type SocialMediaKind = "image" | "video";

export const SOCIAL_MIME_LIST = Object.keys(SOCIAL_MEDIA_TYPES) as SocialMime[];
/** Value for `<input type="file" accept="...">`. */
export const SOCIAL_ACCEPT = SOCIAL_MIME_LIST.join(",");

export function isSocialMime(value: unknown): value is SocialMime {
  return (
    typeof value === "string" &&
    Object.prototype.hasOwnProperty.call(SOCIAL_MEDIA_TYPES, value)
  );
}

export function socialKindFor(mime: string): SocialMediaKind | null {
  return isSocialMime(mime) ? SOCIAL_MEDIA_TYPES[mime].kind : null;
}

const MIME_BY_EXT: Record<string, SocialMime> = {
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  png: "image/png",
  webp: "image/webp",
  gif: "image/gif",
  mp4: "video/mp4",
  webm: "video/webm",
  mov: "video/quicktime",
};

/**
 * The type to use for a picked file. Browsers sometimes report an empty type
 * for `.mov` / `.mp4` (Windows especially), so fall back to the extension.
 * Returns "" when neither is recognised.
 */
export function mimeForFile(file: { name: string; type: string }): string {
  if (isSocialMime(file.type)) return file.type;
  const ext = file.name.split(".").pop()?.toLowerCase() ?? "";
  return Object.prototype.hasOwnProperty.call(MIME_BY_EXT, ext)
    ? MIME_BY_EXT[ext]
    : "";
}

/** A stored file name: `<uuid>.<allowed extension>` and nothing else. */
export const SOCIAL_STORED_NAME_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.(jpg|png|webp|gif|mp4|webm|mov)$/i;

/** "12.4 MB" style size, for the file list in the composer. */
export function formatBytes(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes < 0) return "";
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

/**
 * Early browser-side check. Returns a human message, or null when the file is
 * acceptable. The server repeats this — this one only saves a wasted upload.
 */
export function checkSocialFile(file: {
  type: string;
  size: number;
  name: string;
}): string | null {
  if (!mimeForFile(file)) {
    return `${file.name}: only JPG, PNG, WebP, GIF, MP4, WebM or MOV files are allowed.`;
  }
  if (file.size <= 0) return `${file.name}: the file is empty.`;
  if (file.size > SOCIAL_MAX_FILE_BYTES) {
    return `${file.name}: larger than ${SOCIAL_MAX_FILE_BYTES / (1024 * 1024)} MB.`;
  }
  return null;
}
