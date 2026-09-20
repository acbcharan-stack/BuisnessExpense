import { z } from "zod";
import { UUID_RE } from "@/lib/uuid";
import {
  SOCIAL_CAPTION_MAX,
  SOCIAL_COMMENT_MAX,
  SOCIAL_MAX_FILES,
  SOCIAL_MAX_FILE_BYTES,
  SOCIAL_MIME_LIST,
  SOCIAL_STORED_NAME_RE,
  SOCIAL_TITLE_MAX,
} from "@/lib/social";

const uuid = z.string().regex(UUID_RE, "Invalid id.");

/** Removes invisible control characters, but keeps newlines, returns and tabs. */
export function stripControlChars(value: string): string {
  return value.replace(/[^\P{Cc}\n\r\t]/gu, "");
}

/** Free text: control characters stripped, then trimmed and length-limited. */
const cleanText = (max: number) =>
  z
    .string()
    .transform((v) => stripControlChars(v).trim())
    .pipe(z.string().max(max, `Keep it under ${max} characters.`));

/** Step 1 — "I want to upload these files": only descriptions, no bytes. */
export const prepareUploadSchema = z.object({
  files: z
    .array(
      z.object({
        type: z.enum(SOCIAL_MIME_LIST as [string, ...string[]]),
        size: z
          .number()
          .int()
          .positive()
          .max(SOCIAL_MAX_FILE_BYTES, "A file is too large."),
      }),
    )
    .min(1, "Add at least one photo or video.")
    .max(SOCIAL_MAX_FILES, `At most ${SOCIAL_MAX_FILES} files per post.`),
});

/** Step 2 — "the files are uploaded, publish the post". */
export const publishPostSchema = z.object({
  postId: uuid,
  title: cleanText(SOCIAL_TITLE_MAX).pipe(
    z.string().min(1, "Give the post a title."),
  ),
  caption: cleanText(SOCIAL_CAPTION_MAX).transform((v) => (v === "" ? null : v)),
  files: z
    .array(
      z.object({
        name: z.string().regex(SOCIAL_STORED_NAME_RE, "Invalid file."),
        original_name: cleanText(200),
      }),
    )
    .min(1, "Add at least one photo or video.")
    .max(SOCIAL_MAX_FILES, `At most ${SOCIAL_MAX_FILES} files per post.`),
});

export const addCommentSchema = z.object({
  postId: uuid,
  kind: z.enum(["comment", "suggestion"]),
  body: cleanText(SOCIAL_COMMENT_MAX).pipe(
    z.string().min(1, "Write something first."),
  ),
});

export const idSchema = uuid;

export type PrepareUploadInput = z.input<typeof prepareUploadSchema>;
export type PublishPostInput = z.input<typeof publishPostSchema>;
export type AddCommentInput = z.input<typeof addCommentSchema>;
