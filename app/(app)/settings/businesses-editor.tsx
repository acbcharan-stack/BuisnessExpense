"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button, Card } from "@/components/ui";
import { saveBusiness } from "./actions";

interface Row {
  id?: string;
  name: string;
  legal_name: string;
  gstin: string;
  gst_state_code: string;
  address: string;
}

const field =
  "w-full rounded-lg border border-zinc-300 bg-white px-2.5 py-1.5 text-sm outline-none transition focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20 dark:border-zinc-700 dark:bg-zinc-950";

function BusinessCard({ initial }: { initial: Row }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [row, setRow] = useState<Row>(initial);
  const [msg, setMsg] = useState<{ kind: "ok" | "err"; text: string } | null>(
    null,
  );
  const isNew = !initial.id;

  const up = (patch: Partial<Row>) => setRow((r) => ({ ...r, ...patch }));

  function save() {
    setMsg(null);
    startTransition(async () => {
      const res = await saveBusiness({
        id: row.id,
        name: row.name,
        legal_name: row.legal_name,
        gstin: row.gstin,
        gst_state_code: row.gst_state_code,
        address: row.address,
      });
      if (!res.ok) {
        setMsg({ kind: "err", text: res.error ?? "Save failed." });
        return;
      }
      setMsg({ kind: "ok", text: "Saved." });
      if (isNew)
        setRow({
          name: "",
          legal_name: "",
          gstin: "",
          gst_state_code: "",
          address: "",
        });
      router.refresh();
    });
  }

  return (
    <Card className="p-3">
      <div className="grid gap-2 sm:grid-cols-2">
        <label className="block">
          <span className="mb-1 block text-xs font-medium text-zinc-500">
            Name
          </span>
          <input
            className={field}
            value={row.name}
            placeholder={isNew ? "e.g. acb" : undefined}
            onChange={(e) => up({ name: e.target.value })}
          />
        </label>
        <label className="block">
          <span className="mb-1 block text-xs font-medium text-zinc-500">
            Legal name
          </span>
          <input
            className={field}
            value={row.legal_name}
            onChange={(e) => up({ legal_name: e.target.value })}
          />
        </label>
        <label className="block">
          <span className="mb-1 block text-xs font-medium text-zinc-500">
            GSTIN
          </span>
          <input
            className={field}
            value={row.gstin}
            maxLength={15}
            autoCapitalize="characters"
            onChange={(e) => up({ gstin: e.target.value.toUpperCase() })}
          />
        </label>
        <label className="block">
          <span className="mb-1 block text-xs font-medium text-zinc-500">
            GST state code
          </span>
          <input
            className={field}
            value={row.gst_state_code}
            inputMode="numeric"
            maxLength={2}
            onChange={(e) => up({ gst_state_code: e.target.value })}
          />
        </label>
        <label className="block sm:col-span-2">
          <span className="mb-1 block text-xs font-medium text-zinc-500">
            Address
          </span>
          <input
            className={field}
            value={row.address}
            onChange={(e) => up({ address: e.target.value })}
          />
        </label>
      </div>
      <div className="mt-2 flex items-center gap-3">
        <Button
          size="sm"
          variant={isNew ? "primary" : "secondary"}
          loading={pending}
          onClick={save}
        >
          {isNew ? "Add business" : "Save"}
        </Button>
        {msg && (
          <span
            className={`text-xs ${
              msg.kind === "ok" ? "text-emerald-600" : "text-red-600"
            }`}
          >
            {msg.text}
          </span>
        )}
      </div>
    </Card>
  );
}

export function BusinessesEditor({
  businesses,
  canManage,
}: {
  businesses: {
    id: string;
    name: string;
    legal_name: string | null;
    gstin: string | null;
    gst_state_code: string | null;
    address: string | null;
  }[];
  canManage: boolean;
}) {
  if (!canManage) {
    return (
      <Card className="divide-y divide-zinc-100 text-sm dark:divide-zinc-800">
        {businesses.map((b) => (
          <div key={b.id} className="flex justify-between px-4 py-2.5">
            <span className="font-medium capitalize">{b.name}</span>
            <span className="text-xs text-zinc-500">
              {b.gstin ?? "no GSTIN"}
            </span>
          </div>
        ))}
        <p className="px-4 py-2 text-xs text-zinc-400">
          Sign in to edit businesses.
        </p>
      </Card>
    );
  }

  return (
    <div className="space-y-3">
      {businesses.map((b) => (
        <BusinessCard
          key={b.id}
          initial={{
            id: b.id,
            name: b.name,
            legal_name: b.legal_name ?? "",
            gstin: b.gstin ?? "",
            gst_state_code: b.gst_state_code ?? "",
            address: b.address ?? "",
          }}
        />
      ))}
      <BusinessCard
        initial={{
          name: "",
          legal_name: "",
          gstin: "",
          gst_state_code: "",
          address: "",
        }}
      />
    </div>
  );
}
