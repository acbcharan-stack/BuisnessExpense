import type { Metadata } from "next";
import Link from "next/link";
import { requireProfile } from "@/lib/supabase/auth";
import { PageHeader } from "@/components/page-header";
import { APP_NAME } from "@/lib/constants";
import { PostComposer } from "./composer";

export const metadata: Metadata = { title: `New post · ${APP_NAME}` };
export const dynamic = "force-dynamic";

export default async function NewSocialPostPage() {
  await requireProfile();
  return (
    <>
      <PageHeader
        title="New post"
        description="Add one or more photos and videos. Teammates will be able to comment and suggest changes."
        action={
          <Link
            href="/social"
            className="text-sm text-zinc-500 hover:text-zinc-700 dark:hover:text-zinc-300"
          >
            ← All posts
          </Link>
        }
      />
      <PostComposer />
    </>
  );
}
