import type { Metadata } from "next";
import { createClient } from "@/lib/supabase/server";
import { requireProfile } from "@/lib/supabase/auth";
import { PageHeader } from "@/components/page-header";

export const metadata: Metadata = { title: "Settings · Invoice Scanner" };

export default async function SettingsPage() {
  const profile = await requireProfile();
  const supabase = await createClient();

  const [{ data: categories }, { data: team }] = await Promise.all([
    supabase
      .from("categories")
      .select("id, name, zoho_account_name, default_record_type")
      .order("name"),
    supabase.from("profiles").select("full_name, role").order("role"),
  ]);

  return (
    <>
      <PageHeader
        title="Settings"
        description="Categories, Zoho account mapping and team."
      />

      <section className="mb-8">
        <h2 className="mb-2 text-sm font-semibold">Team</h2>
        <ul className="rounded-xl border border-zinc-200 bg-white text-sm dark:border-zinc-800 dark:bg-zinc-900">
          {(team ?? []).map((m, i) => (
            <li
              key={i}
              className="flex justify-between border-b border-zinc-100 px-4 py-2 last:border-0 dark:border-zinc-800"
            >
              <span>{m.full_name || "(no name)"}</span>
              <span className="text-xs text-zinc-500">{m.role}</span>
            </li>
          ))}
        </ul>
        <p className="mt-2 text-xs text-zinc-500">
          Accounts are created in the Supabase dashboard. Roles are changed via
          SQL. You are signed in as <strong>{profile.role}</strong>.
        </p>
      </section>

      <section>
        <h2 className="mb-2 text-sm font-semibold">
          Categories &amp; Zoho accounts
        </h2>
        <div className="overflow-x-auto rounded-xl border border-zinc-200 bg-white dark:border-zinc-800 dark:bg-zinc-900">
          <table className="w-full text-sm">
            <thead className="border-b border-zinc-200 text-left text-xs uppercase tracking-wide text-zinc-500 dark:border-zinc-800">
              <tr>
                <th className="px-4 py-2">Category</th>
                <th className="px-4 py-2">Default tab</th>
                <th className="px-4 py-2">Zoho account</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-zinc-100 dark:divide-zinc-800">
              {(categories ?? []).map((c) => (
                <tr key={c.id}>
                  <td className="px-4 py-2">{c.name}</td>
                  <td className="px-4 py-2 text-xs text-zinc-500">
                    {c.default_record_type}
                  </td>
                  <td className="px-4 py-2 text-zinc-500">
                    {c.zoho_account_name ?? "—"}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="mt-2 text-xs text-zinc-500">
          Editing these mappings inline arrives with the Zoho export in Phase&nbsp;3.
        </p>
      </section>
    </>
  );
}
