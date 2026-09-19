"use client";

import { useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button, Card } from "@/components/ui";
import {
  saveBusiness,
  uploadBusinessLogo,
  removeBusinessLogo,
  uploadBusinessSignature,
  removeBusinessSignature,
} from "./actions";

interface Row {
  id?: string;
  name: string;
  legal_name: string;
  gstin: string;
  gst_state_code: string;
  address: string;
  bank_account_name: string;
  bank_account_number: string;
  bank_ifsc: string;
  bank_name: string;
  invoice_prefix: string;
  terms_and_conditions: string;
  signatureUrl: string | null;
  logoUrl: string | null;
}

const field =
  "w-full rounded-lg border border-zinc-300 bg-white px-2.5 py-1.5 text-sm outline-none transition focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20 dark:border-zinc-700 dark:bg-zinc-950";

const emptyRow: Row = {
  name: "",
  legal_name: "",
  gstin: "",
  gst_state_code: "",
  address: "",
  bank_account_name: "",
  bank_account_number: "",
  bank_ifsc: "",
  bank_name: "",
  invoice_prefix: "",
  terms_and_conditions: "",
  signatureUrl: null,
  logoUrl: null,
};

/** A signature/logo file upload with a small preview, used inside a saved business's card. */
function AssetUploader({
  businessId,
  label,
  previewUrl,
  onUpload,
  onRemove,
}: {
  businessId: string;
  label: string;
  previewUrl: string | null;
  onUpload: (businessId: string, formData: FormData) => Promise<{ ok: boolean; error?: string }>;
  onRemove: (businessId: string) => Promise<{ ok: boolean; error?: string }>;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [msg, setMsg] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  function handleFile(file: File | undefined) {
    if (!file) return;
    setMsg(null);
    startTransition(async () => {
      const formData = new FormData();
      formData.set("file", file);
      const res = await onUpload(businessId, formData);
      if (!res.ok) setMsg(res.error ?? "Upload failed.");
      router.refresh();
    });
  }

  return (
    <div>
      <span className="mb-1 block text-xs font-medium text-zinc-500">{label}</span>
      <div className="flex items-center gap-3">
        {previewUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={previewUrl}
            alt={label}
            className="h-10 max-w-[7rem] rounded border border-zinc-200 object-contain dark:border-zinc-700"
          />
        ) : (
          <span className="text-xs text-zinc-400">None uploaded</span>
        )}
        <input
          ref={inputRef}
          type="file"
          accept="image/png,image/jpeg"
          className="hidden"
          onChange={(e) => handleFile(e.target.files?.[0])}
        />
        <Button
          size="sm"
          variant="secondary"
          loading={pending}
          onClick={() => inputRef.current?.click()}
        >
          {previewUrl ? "Replace" : "Upload"}
        </Button>
        {previewUrl && (
          <Button
            size="sm"
            variant="ghost"
            disabled={pending}
            onClick={() =>
              startTransition(async () => {
                await onRemove(businessId);
                router.refresh();
              })
            }
          >
            Remove
          </Button>
        )}
      </div>
      {msg && <p className="mt-1 text-xs text-red-600">{msg}</p>}
    </div>
  );
}

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
        bank_account_name: row.bank_account_name,
        bank_account_number: row.bank_account_number,
        bank_ifsc: row.bank_ifsc,
        bank_name: row.bank_name,
        invoice_prefix: row.invoice_prefix,
        terms_and_conditions: row.terms_and_conditions,
      });
      if (!res.ok) {
        setMsg({ kind: "err", text: res.error ?? "Save failed." });
        return;
      }
      setMsg({ kind: "ok", text: "Saved." });
      if (isNew) setRow(emptyRow);
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
        <label className="block">
          <span className="mb-1 block text-xs font-medium text-zinc-500">
            Invoice number prefix
          </span>
          <input
            className={field}
            value={row.invoice_prefix}
            placeholder="e.g. ACB"
            onChange={(e) => up({ invoice_prefix: e.target.value.toUpperCase() })}
          />
        </label>
      </div>

      <div className="mt-3 grid gap-2 border-t border-zinc-100 pt-3 sm:grid-cols-2 dark:border-zinc-800">
        <label className="block">
          <span className="mb-1 block text-xs font-medium text-zinc-500">
            Bank account name
          </span>
          <input
            className={field}
            value={row.bank_account_name}
            onChange={(e) => up({ bank_account_name: e.target.value })}
          />
        </label>
        <label className="block">
          <span className="mb-1 block text-xs font-medium text-zinc-500">
            Bank account number
          </span>
          <input
            className={field}
            value={row.bank_account_number}
            onChange={(e) => up({ bank_account_number: e.target.value })}
          />
        </label>
        <label className="block">
          <span className="mb-1 block text-xs font-medium text-zinc-500">
            Bank name
          </span>
          <input
            className={field}
            value={row.bank_name}
            onChange={(e) => up({ bank_name: e.target.value })}
          />
        </label>
        <label className="block">
          <span className="mb-1 block text-xs font-medium text-zinc-500">
            IFSC
          </span>
          <input
            className={field}
            value={row.bank_ifsc}
            maxLength={11}
            autoCapitalize="characters"
            onChange={(e) => up({ bank_ifsc: e.target.value.toUpperCase() })}
          />
        </label>
        <label className="block sm:col-span-2">
          <span className="mb-1 block text-xs font-medium text-zinc-500">
            Terms &amp; conditions
          </span>
          <textarea
            className={`${field} min-h-16`}
            value={row.terms_and_conditions}
            placeholder="Shown on generated invoices, near the signature."
            onChange={(e) => up({ terms_and_conditions: e.target.value })}
          />
        </label>
      </div>

      {!isNew && row.id && (
        <div className="mt-3 grid gap-3 border-t border-zinc-100 pt-3 sm:grid-cols-2 dark:border-zinc-800">
          <AssetUploader
            businessId={row.id}
            label="Logo"
            previewUrl={row.logoUrl}
            onUpload={uploadBusinessLogo}
            onRemove={removeBusinessLogo}
          />
          <AssetUploader
            businessId={row.id}
            label="Authorized signature"
            previewUrl={row.signatureUrl}
            onUpload={uploadBusinessSignature}
            onRemove={removeBusinessSignature}
          />
        </div>
      )}

      <div className="mt-3 flex items-center gap-3">
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
    bank_account_name: string | null;
    bank_account_number: string | null;
    bank_ifsc: string | null;
    bank_name: string | null;
    invoice_prefix: string | null;
    terms_and_conditions: string | null;
    signatureUrl: string | null;
    logoUrl: string | null;
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
            bank_account_name: b.bank_account_name ?? "",
            bank_account_number: b.bank_account_number ?? "",
            bank_ifsc: b.bank_ifsc ?? "",
            bank_name: b.bank_name ?? "",
            invoice_prefix: b.invoice_prefix ?? "",
            terms_and_conditions: b.terms_and_conditions ?? "",
            signatureUrl: b.signatureUrl,
            logoUrl: b.logoUrl,
          }}
        />
      ))}
      <BusinessCard initial={emptyRow} />
    </div>
  );
}
