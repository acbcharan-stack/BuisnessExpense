import type { Metadata } from "next";
import { createClient } from "@/lib/supabase/server";
import { requireProfile } from "@/lib/supabase/auth";
import { PageHeader } from "@/components/page-header";
import { Badge, Card } from "@/components/ui";
import { APP_NAME } from "@/lib/constants";
import { BusinessesEditor } from "./businesses-editor";

export const metadata: Metadata = { title: `Settings · ${APP_NAME}` };
export const dynamic = "force-dynamic";

export default async function SettingsPage() {
  const profile = await requireProfile();
  const canManage = profile.role === "owner" || profile.role === "accountant";
  const supabase = await createClient();

  const [{ data: categories }, { data: team }, { data: businesses }] =
    await Promise.all([
      supabase
        .from("categories")
        .select("id, name, zoho_account_name, default_record_type")
        .order("name"),
      supabase.from("profiles").select("full_name, role").order("role"),
      supabase
        .from("businesses")
        .select("id, name, legal_name, gstin, gst_state_code, address")
        .eq("is_archived", false)
        .order("sort", { ascending: true }),
    ]);

  return (
    <>
      <PageHeader
        title="Settings"
        description="Businesses, categories, Zoho account mapping and team."
      />

      <section className="mb-8">
        <h2 className="mb-2 text-sm font-semibold">
          Your businesses{" "}
          <span className="font-normal text-zinc-400">
            ({businesses?.length ?? 0})
          </span>
        </h2>
        <BusinessesEditor
          businesses={businesses ?? []}
          canManage={canManage}
        />
        <p className="mt-2 text-xs text-zinc-500">
          Each record (purchase order or expense) is tagged with one of these.
          The GSTIN is used in exports and GST logic.
        </p>
      </section>

      <section className="mb-8">
        <h2 className="mb-2 text-sm font-semibold">Team</h2>
        <Card className="divide-y divide-zinc-100 text-sm dark:divide-zinc-800">
          {(team ?? []).map((m, i) => (
            <div
              key={i}
              className="flex items-center justify-between px-4 py-2.5"
            >
              <span className="font-medium">{m.full_name || "(no name)"}</span>
              <Badge>{m.role}</Badge>
            </div>
          ))}
        </Card>
        <p className="mt-2 text-xs text-zinc-500">
          Accounts are created in the Supabase dashboard; roles are changed via
          SQL. You are signed in as <strong className="capitalize">{profile.role}</strong>.
        </p>
      </section>

      <section>
        <h2 className="mb-2 text-sm font-semibold">
          Categories &amp; Zoho accounts{" "}
          <span className="font-normal text-zinc-400">
            ({categories?.length ?? 0})
          </span>
        </h2>
        <Card className="overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="border-b border-zinc-200 text-left text-[11px] uppercase tracking-wide text-zinc-500 dark:border-zinc-800">
                <tr>
                  <th className="px-4 py-2.5 font-medium">Category</th>
                  <th className="px-4 py-2.5 font-medium">Default tab</th>
                  <th className="px-4 py-2.5 font-medium">Zoho account</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-zinc-100 dark:divide-zinc-800">
                {(categories ?? []).map((c) => (
                  <tr key={c.id}>
                    <td className="px-4 py-2.5 font-medium">{c.name}</td>
                    <td className="px-4 py-2.5">
                      <Badge>{c.default_record_type}</Badge>
                    </td>
                    <td className="px-4 py-2.5 text-zinc-500">
                      {c.zoho_account_name ?? "—"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
        <p className="mt-2 text-xs text-zinc-500">
          Editing these mappings inline arrives with the Zoho export in Phase&nbsp;3.
        </p>
      </section>
    </>
  );
}
