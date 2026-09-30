import { z } from "zod";
import { DIRECT_UPLOAD_MIME_TYPES, MAX_UPLOAD_BYTES } from "@/lib/constants";

/**
 * Shapes for the two-step direct image upload. Both requests come from the
 * browser, so both are validated strictly on the server.
 */

export const prepareUploadSchema = z.object({
  filename: z.string().min(1).max(500),
  type: z.enum(DIRECT_UPLOAD_MIME_TYPES),
  size: z.number().int().positive().max(MAX_UPLOAD_BYTES),
});

/** Names the server invents: `<uuid>.<image ext>` — no folders, no user input. */
export const STORED_IMAGE_PATH_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.(jpg|png|webp|heic|heif)$/;

export const finalizeUploadSchema = z.object({
  path: z.string().regex(STORED_IMAGE_PATH_RE),
  filename: z.string().min(1).max(500),
});
