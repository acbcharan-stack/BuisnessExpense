"use server";

import { randomUUID } from "node:crypto";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { requireProfile } from "@/lib/supabase/auth";
import { SOCIAL_BUCKET } from "@/lib/constants";
import {
  SOCIAL_MAX_FILE_BYTES,
  SOCIAL_MEDIA_TYPES,
  isSocialMime,
} from "@/lib/social";
import {
  addCommentSchema,
  idSchema,
  prepareUploadSchema,
  publishPostSchema,
  type AddCommentInput,
  type PrepareUploadInput,
  type PublishPostInput,
} from "./form-schema";

export interface ActionResult {
  ok: boolean;
  error?: string;
  id?: string;
}

export interface PreparedUpload {
  /** Stored file name: `<uuid>.<ext>`, chosen by the server. */
  name: string;
  /** Full path inside the bucket: `<postId>/<name>`. */
  path: string;
  /** One-time permission slip that lets the browser upload to exactly `path`. */
  token: string;
}

export type PrepareResult =
  | { ok: true; postId: string; uploads: PreparedUpload[] }
  | { ok: false; error: string };

const firstIssue = (e: { issues: { message: string }[] }) =>
  e.issues[0]?.message ?? "Invalid input.";

/**
 * Step 1 of posting. The browser says "I have N files of these types"; the
 * server invents the post id and the file names and hands back one signed
 * upload slip per file.
 *
 * Metaphor: the front desk gives each visitor a numbered locker key. The
 * visitor can only open *that* locker — they never get to pick which locker,
 * and the lockers only accept the kinds of items on the approved list.
 */
export async function prepareSocialUpload(
  input: PrepareUploadInput,
): Promise<PrepareResult> {
  await requireProfile();

  const parsed = prepareUploadSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: firstIssue(parsed.error) };

  const supabase = await createClient();
  const postId = randomUUID();
  const uploads: PreparedUpload[] = [];

  for (const f of parsed.data.files) {
    if (!isSocialMime(f.type)) return { ok: false, error: "Unsupported file type." };
    const name = `${randomUUID()}.${SOCIAL_MEDIA_TYPES[f.type].ext}`;
    const path = `${postId}/${name}`;
    const { data, error } = await supabase.storage
      .from(SOCIAL_BUCKET)
      .createSignedUploadUrl(path);
    if (error || !data) {
      return { ok: false, error: "Could not start the upload. Please try again." };
    }
    uploads.push({ name, path, token: data.token });
  }

  return { ok: true, postId, uploads };
}

/**
 * Step 2. The browser claims "these files are uploaded". We don't take its
 * word: we look inside the locker room ourselves, confirm every claimed file
 * is really there, and read its true size and type from storage before the
 * post is created.
 */
export async function publishSocialPost(
  input: PublishPostInput,
): Promise<ActionResult> {
  const profile = await requireProfile();

  const parsed = publishPostSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: firstIssue(parsed.error) };
  const { postId, title, caption, files } = parsed.data;

  if (new Set(files.map((f) => f.name)).size !== files.length) {
    return { ok: false, error: "Duplicate file in the post." };
  }

  const supabase = await createClient();

  const { data: stored, error: listError } = await supabase.storage
    .from(SOCIAL_BUCKET)
    .list(postId, { limit: 100 });
  if (listError) return { ok: false, error: "Could not check the uploaded files." };
  const byName = new Map((stored ?? []).map((o) => [o.name, o]));

  const mediaRows: {
    post_id: string;
    position: number;
    storage_path: string;
    kind: "image" | "video";
    mime_type: string;
    size_bytes: number;
    original_name: string | null;
  }[] = [];

  for (let i = 0; i < files.length; i++) {
    const f = files[i];
    const obj = byName.get(f.name);
    const mime = obj?.metadata?.mimetype;
    const size = obj?.metadata?.size;
    if (!obj || typeof mime !== "string" || typeof size !== "number") {
      return { ok: false, error: "A file did not finish uploading. Please try again." };
    }
    if (!isSocialMime(mime)) {
      return { ok: false, error: "A file has an unsupported type." };
    }
    if (size <= 0 || size > SOCIAL_MAX_FILE_BYTES) {
      return { ok: false, error: "A file is empty or too large." };
    }
    mediaRows.push({
      post_id: postId,
      position: i,
      storage_path: `${postId}/${f.name}`,
      kind: SOCIAL_MEDIA_TYPES[mime].kind,
      mime_type: mime,
      size_bytes: size,
      original_name: f.original_name || null,
    });
  }

  // author_id always comes from the signed-in session, never from the browser.
  const { error: postError } = await supabase
    .from("social_posts")
    .insert({ id: postId, author_id: profile.id, title, caption });
  if (postError) return { ok: false, error: "Could not create the post." };

  const { error: mediaError } = await supabase
    .from("social_post_media")
    .insert(mediaRows);
  if (mediaError) {
    // Roll back so we never show a post with missing pictures.
    await supabase.from("social_posts").delete().eq("id", postId);
    await removeFolder(postId);
    return { ok: false, error: "Could not attach the files to the post." };
  }

  revalidatePath("/social");
  return { ok: true, id: postId };
}

/**
 * Called when an upload fails half-way, to tidy the locker room. Only ever
 * touches a folder whose post does NOT exist — a real post's files can't be
 * removed this way.
 */
export async function abandonSocialUpload(postId: string): Promise<ActionResult> {
  await requireProfile();
  const id = idSchema.safeParse(postId);
  if (!id.success) return { ok: false, error: "Invalid id." };

  const supabase = await createClient();
  const { data: existing } = await supabase
    .from("social_posts")
    .select("id")
    .eq("id", id.data)
    .maybeSingle();
  if (existing) return { ok: false, error: "That post already exists." };

  await removeFolder(id.data);
  return { ok: true };
}

/** Add a comment or a suggested change to a post. */
export async function addSocialComment(
  input: AddCommentInput,
): Promise<ActionResult> {
  const profile = await requireProfile();

  const parsed = addCommentSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: firstIssue(parsed.error) };

  const supabase = await createClient();
  const { error } = await supabase.from("social_post_comments").insert({
    post_id: parsed.data.postId,
    author_id: profile.id,
    kind: parsed.data.kind,
    body: parsed.data.body,
  });
  if (error) return { ok: false, error: "Could not post your comment." };

  revalidatePath(`/social/${parsed.data.postId}`);
  revalidatePath("/social");
  return { ok: true };
}

/** Delete a comment: allowed for its writer, or for the post's author. */
export async function deleteSocialComment(commentId: string): Promise<ActionResult> {
  await requireProfile();
  const id = idSchema.safeParse(commentId);
  if (!id.success) return { ok: false, error: "Invalid id." };

  const supabase = await createClient();
  // The database rules (RLS) decide who may delete; a refused delete simply
  // matches zero rows.
  const { data, error } = await supabase
    .from("social_post_comments")
    .delete()
    .eq("id", id.data)
    .select("id, post_id");
  if (error) return { ok: false, error: "Could not delete the comment." };
  if (!data || data.length === 0) {
    return { ok: false, error: "You can only delete your own comments." };
  }

  revalidatePath(`/social/${data[0].post_id}`);
  revalidatePath("/social");
  return { ok: true };
}

/** Delete a whole post and its files. Only the post's author can. */
export async function deleteSocialPost(postId: string): Promise<ActionResult> {
  await requireProfile();
  const id = idSchema.safeParse(postId);
  if (!id.success) return { ok: false, error: "Invalid id." };

  const supabase = await createClient();
  const { data: media } = await supabase
    .from("social_post_media")
    .select("storage_path")
    .eq("post_id", id.data);

  const { data, error } = await supabase
    .from("social_posts")
    .delete()
    .eq("id", id.data)
    .select("id");
  if (error) return { ok: false, error: "Could not delete the post." };
  if (!data || data.length === 0) {
    return { ok: false, error: "You can only delete your own posts." };
  }

  // Row is gone (and the author was verified by the database). Now the files.
  const paths = (media ?? []).map((m) => m.storage_path);
  if (paths.length > 0) {
    await createAdminClient().storage.from(SOCIAL_BUCKET).remove(paths);
  }

  revalidatePath("/social");
  return { ok: true };
}

/** Remove every object in a post's folder (trusted server code only). */
async function removeFolder(postId: string): Promise<void> {
  const admin = createAdminClient();
  const { data } = await admin.storage
    .from(SOCIAL_BUCKET)
    .list(postId, { limit: 100 });
  const paths = (data ?? []).map((o) => `${postId}/${o.name}`);
  if (paths.length > 0) await admin.storage.from(SOCIAL_BUCKET).remove(paths);
}
