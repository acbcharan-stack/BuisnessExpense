"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { RECORD_TYPES, RECORD_TYPE_LABELS, TAX_TYPES } from "@/lib/types";
import type { RecordType, TaxType } from "@/lib/types";
import { Badge, Button, Card, Icon } from "@/components/ui";
import type { RecordFormValues } from "./form-schema";
import { saveRecord, confirmRecord, createManualRecord } from "./actions";

type Scalarish = string | number;

export interface ReviewFormData {
  expenseId: string;
  status: string;
  canManage: boolean;
  manual: boolean;
  /** "create" = new manual record (no id yet); "review" = existing record. */
  mode?: "create" | "review";
  document: {
    mimeType: string | null;
    filename: string | null;
    signedUrl: string | null;
    downloadUrl: string | null;
  };
  categories: {
    id: string;
    name: string;
    default_record_type: "invoice" | "expense";
  }[];
  businesses: { id: string; name: string }[];
  vendors: { id: string; name: string }[];
  confidence: number | null;
  initial: {
    record_type: RecordType;
    business_id: string;
    vendor_name: string;
    category_id: string;
    new_category_name: string;
    invoice_number: string;
    invoice_date: string;
    due_date: string;
    currency: string;
    country: string;
    subtotal: Scalarish;
    tax_total: Scalarish;
    total: Scalarish;
    notes: string;
    line_items: {
      description: string;
      hsn_sac: string;
      quantity: Scalarish;
      unit_price: Scalarish;
      amount: Scalarish;
      tax_rate: Scalarish;
    }[];
    taxes: {
      tax_type: TaxType;
      rate: Scalarish;
      amount: Scalarish;
      jurisdiction: string;
    }[];
    custom_fields: { label: string; value: string }[];
  };
}

interface LineItemState {
  description: string;
  hsn_sac: string;
  quantity: string;
  unit_price: string;
  amount: string;
  tax_rate: string;
}
interface TaxState {
  tax_type: TaxType;
  rate: string;
  amount: string;
  jurisdiction: string;
}
interface CustomFieldState {
  label: string;
  value: string;
}
interface FormState {
  record_type: RecordType;
  business_id: string;
  vendor_name: string;
  category_id: string;
  new_category_name: string;
  invoice_number: string;
  invoice_date: string;
  due_date: string;
  currency: string;
  country: string;
  subtotal: string;
  tax_total: string;
  total: string;
  notes: string;
  line_items: LineItemState[];
  taxes: TaxState[];
  custom_fields: CustomFieldState[];
}

const s = (v: Scalarish): string => (v === "" || v == null ? "" : String(v));
const num = (v: string): number => Number(String(v).replace(/[, ]/g, "")) || 0;

const inputCls =
  "w-full rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm outline-none transition focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20 disabled:bg-zinc-50 disabled:text-zinc-500 dark:border-zinc-700 dark:bg-zinc-950 dark:disabled:bg-zinc-900";
const cellCls =
  "w-full rounded-md border border-transparent bg-transparent px-2 py-1.5 text-sm outline-none focus:border-blue-400 focus:bg-white disabled:text-zinc-500 dark:focus:bg-zinc-950";

function Field({
  label,
  hint,
  children,
}: {
  label: string;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <label className="block">
      <span className="mb-1 flex items-baseline justify-between">
        <span className="text-xs font-medium text-zinc-500">{label}</span>
        {hint ? <span className="text-[10px] text-zinc-400">{hint}</span> : null}
      </span>
      {children}
    </label>
  );
}

function SectionTitle({
  children,
  action,
}: {
  children: React.ReactNode;
  action?: React.ReactNode;
}) {
  return (
    <div className="mb-2 flex items-center justify-between">
      <h3 className="text-sm font-semibold">{children}</h3>
      {action}
    </div>
  );
}

const emptyLine: LineItemState = {
  description: "",
  hsn_sac: "",
  quantity: "",
  unit_price: "",
  amount: "",
  tax_rate: "",
};
const emptyTax: TaxState = {
  tax_type: "GST",
  rate: "",
  amount: "",
  jurisdiction: "",
};
const emptyCustom: CustomFieldState = { label: "", value: "" };

function buildInitial(d: ReviewFormData["initial"]): FormState {
  return {
    record_type: d.record_type,
    business_id: d.business_id,
    vendor_name: d.vendor_name,
    category_id: d.category_id,
    new_category_name: d.new_category_name,
    invoice_number: d.invoice_number,
    invoice_date: d.invoice_date,
    due_date: d.due_date,
    currency: d.currency,
    country: d.country,
    subtotal: s(d.subtotal),
    tax_total: s(d.tax_total),
    total: s(d.total),
    notes: d.notes,
    line_items: d.line_items.map((li) => ({
      description: li.description,
      hsn_sac: li.hsn_sac,
      quantity: s(li.quantity),
      unit_price: s(li.unit_price),
      amount: s(li.amount),
      tax_rate: s(li.tax_rate),
    })),
    taxes: d.taxes.map((t) => ({
      tax_type: t.tax_type,
      rate: s(t.rate),
      amount: s(t.amount),
      jurisdiction: t.jurisdiction,
    })),
    custom_fields: d.custom_fields.map((f) => ({
      label: f.label,
      value: f.value,
    })),
  };
}

export function ReviewForm({ data }: { data: ReviewFormData }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [feedback, setFeedback] = useState<
    { kind: "ok" | "err"; text: string } | null
  >(null);
  const [imgBroken, setImgBroken] = useState(false);

  const [pristine, setPristine] = useState<FormState>(() =>
    buildInitial(data.initial),
  );
  const [form, setForm] = useState<FormState>(() => buildInitial(data.initial));

  const isCreate = data.mode === "create";
  const isReview = isCreate || data.status === "review";
  const locked =
    !isCreate &&
    (data.status === "exported" ||
      data.status === "archived" ||
      (data.status === "confirmed" && !data.canManage));
  const [editing, setEditing] = useState(isCreate || data.status === "review");
  const readOnly = locked || !editing;

  const set = <K extends keyof FormState>(key: K, value: FormState[K]) =>
    setForm((f) => ({ ...f, [key]: value }));
  const setLine = (i: number, patch: Partial<LineItemState>) =>
    setForm((f) => ({
      ...f,
      line_items: f.line_items.map((li, idx) =>
        idx === i ? { ...li, ...patch } : li,
      ),
    }));
  const setTax = (i: number, patch: Partial<TaxState>) =>
    setForm((f) => ({
      ...f,
      taxes: f.taxes.map((t, idx) => (idx === i ? { ...t, ...patch } : t)),
    }));
  const setCustom = (i: number, patch: Partial<CustomFieldState>) =>
    setForm((f) => ({
      ...f,
      custom_fields: f.custom_fields.map((c, idx) =>
        idx === i ? { ...c, ...patch } : c,
      ),
    }));

  const values: RecordFormValues = useMemo(
    () => ({
      record_type: form.record_type,
      business_id: form.business_id || null,
      vendor_name: form.vendor_name,
      category_id: form.category_id || null,
      new_category_name: form.new_category_name,
      invoice_number: form.invoice_number,
      invoice_date: form.invoice_date,
      due_date: form.due_date,
      currency: form.currency,
      country: form.country,
      subtotal: form.subtotal,
      tax_total: form.tax_total,
      total: form.total,
      notes: form.notes,
      line_items: form.line_items,
      taxes: form.taxes,
      custom_fields: form.custom_fields,
    }),
    [form],
  );

  const lineSum = form.line_items.reduce((a, li) => a + num(li.amount), 0);
  const taxSum = form.taxes.reduce((a, t) => a + num(t.amount), 0);
  const totalMismatch =
    form.total !== "" &&
    Math.abs(num(form.subtotal) + num(form.tax_total) - num(form.total)) > 1;

  function runCreate() {
    setFeedback(null);
    startTransition(async () => {
      const res = await createManualRecord(values);
      if (!res.ok || !res.id) {
        setFeedback({
          kind: "err",
          text: res.error ?? "Could not create the record.",
        });
        return;
      }
      router.push(`/records/${res.id}`);
      router.refresh();
    });
  }

  function runSave(then?: "confirm" | "close") {
    setFeedback(null);
    startTransition(async () => {
      const res = await saveRecord(data.expenseId, values);
      if (!res.ok) {
        setFeedback({ kind: "err", text: res.error ?? "Save failed." });
        return;
      }
      if (then === "confirm") {
        const c = await confirmRecord(data.expenseId);
        if (!c.ok) {
          setFeedback({ kind: "err", text: c.error ?? "Confirm failed." });
          return;
        }
        setFeedback({ kind: "ok", text: "Confirmed — returning to Inbox…" });
        router.push("/inbox");
        router.refresh();
        return;
      }
      setPristine({ ...form });
      setFeedback({ kind: "ok", text: "Saved." });
      if (then === "close") setEditing(false);
      router.refresh();
    });
  }

  function cancelEdit() {
    setForm(pristine);
    setEditing(false);
    setFeedback(null);
  }

  const { mimeType, filename, signedUrl, downloadUrl } = data.document;
  const showImg = signedUrl && mimeType?.startsWith("image/") && !imgBroken;
  const showPdf = signedUrl && mimeType === "application/pdf";

  return (
    <div className="grid gap-6 pb-24 lg:grid-cols-2 lg:pb-6">
      {/* Left: document preview */}
      <div className="lg:sticky lg:top-6 lg:self-start">
        <Card className="overflow-hidden">
          <div className="flex items-center justify-between border-b border-zinc-100 px-3 py-2 text-xs text-zinc-500 dark:border-zinc-800">
            <span className="flex items-center gap-1.5 truncate">
              <Icon name="file" className="size-4 shrink-0" />
              <span className="truncate">
                {data.manual ? "Manually entered — no document" : filename ?? "Document"}
              </span>
            </span>
            {signedUrl && (
              <span className="flex shrink-0 items-center gap-3">
                <a
                  href={downloadUrl ?? signedUrl}
                  download={filename ?? true}
                  className="flex items-center gap-1 font-medium text-blue-600 hover:underline dark:text-blue-400"
                >
                  <Icon name="upload" className="size-3.5 rotate-180" />
                  Download
                </a>
                <a
                  href={signedUrl}
                  target="_blank"
                  rel="noreferrer"
                  className="text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-300"
                >
                  Open
                </a>
              </span>
            )}
          </div>
          <div className="bg-zinc-50 p-3 dark:bg-zinc-950/40">
            {data.manual ? (
              <div className="flex flex-col items-center gap-2 p-10 text-center text-sm text-zinc-500">
                <Icon name="file" className="size-8 text-zinc-300" />
                This record was entered by hand. Fill in the fields on the
                right.
              </div>
            ) : showImg ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={signedUrl}
                alt={filename ?? "Document"}
                onError={() => setImgBroken(true)}
                className="mx-auto max-h-[76vh] w-auto rounded-lg shadow-sm"
              />
            ) : showPdf ? (
              <iframe
                src={signedUrl}
                title={filename ?? "Document"}
                className="h-[76vh] w-full rounded-lg bg-white"
              />
            ) : (
              <p className="p-10 text-center text-sm text-zinc-500">
                {signedUrl
                  ? "No inline preview for this file type — use “Open ↗”."
                  : "Preview unavailable."}
              </p>
            )}
          </div>
        </Card>
      </div>

      {/* Right: fields */}
      <form
        className="space-y-5"
        onSubmit={(e) => {
          e.preventDefault();
          if (readOnly) return;
          if (isCreate) runCreate();
          else runSave(data.status === "review" ? undefined : "close");
        }}
      >
        {/* status strip */}
        <div className="flex flex-wrap items-center gap-2 text-sm">
          {isCreate ? (
            <Badge>new manual record</Badge>
          ) : (
            <Badge tone="status">{data.status}</Badge>
          )}
          {data.confidence != null && (
            <span className="text-xs text-zinc-500">
              AI confidence {Math.round(data.confidence * 100)}%
            </span>
          )}
          {locked && (
            <span className="text-xs text-zinc-500">· locked for editing</span>
          )}
          {data.status === "confirmed" && data.canManage && !editing && (
            <Button
              size="sm"
              variant="secondary"
              icon="refresh"
              className="ml-auto"
              onClick={() => setEditing(true)}
            >
              Edit record
            </Button>
          )}
        </div>

        {/* Record type toggle + business */}
        <div className="flex flex-wrap items-end gap-4">
          <div>
            <span className="mb-1 block text-xs font-medium text-zinc-500">
              Record type
            </span>
            <div className="inline-flex rounded-lg border border-zinc-300 p-0.5 dark:border-zinc-700">
              {RECORD_TYPES.map((rt) => (
                <button
                  key={rt}
                  type="button"
                  disabled={readOnly}
                  onClick={() => set("record_type", rt)}
                  className={`rounded-md px-3.5 py-1.5 text-sm transition active:scale-[.97] ${
                    form.record_type === rt
                      ? "bg-blue-600 text-white dark:bg-blue-500"
                      : "text-zinc-600 disabled:opacity-60 dark:text-zinc-300"
                  }`}
                >
                  {RECORD_TYPE_LABELS[rt]}
                </button>
              ))}
            </div>
          </div>

          <div className="min-w-[10rem] flex-1">
            <span className="mb-1 block text-xs font-medium text-zinc-500">
              Business
            </span>
            <select
              className={inputCls}
              value={form.business_id}
              disabled={readOnly}
              onChange={(e) => set("business_id", e.target.value)}
            >
              <option value="">— unassigned —</option>
              {data.businesses.map((b) => (
                <option key={b.id} value={b.id}>
                  {b.name}
                </option>
              ))}
            </select>
          </div>
        </div>

        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Vendor">
            <input
              className={inputCls}
              list="vendor-list"
              value={form.vendor_name}
              disabled={readOnly}
              onChange={(e) => set("vendor_name", e.target.value)}
            />
            <datalist id="vendor-list">
              {data.vendors.map((v) => (
                <option key={v.id} value={v.name} />
              ))}
            </datalist>
          </Field>

          <Field label="Category">
            <select
              className={inputCls}
              value={form.category_id}
              disabled={readOnly}
              onChange={(e) => set("category_id", e.target.value)}
            >
              <option value="">— none —</option>
              {data.categories.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
          </Field>

          <Field label="…or new category" hint="creates on save">
            <input
              className={inputCls}
              value={form.new_category_name}
              placeholder="Type to create"
              disabled={readOnly}
              onChange={(e) => set("new_category_name", e.target.value)}
            />
          </Field>

          <Field label="Invoice number">
            <input
              className={inputCls}
              value={form.invoice_number}
              disabled={readOnly}
              onChange={(e) => set("invoice_number", e.target.value)}
            />
          </Field>

          <Field label="Invoice date">
            <input
              type="date"
              className={inputCls}
              value={form.invoice_date}
              disabled={readOnly}
              onChange={(e) => set("invoice_date", e.target.value)}
            />
          </Field>

          <Field label="Due date">
            <input
              type="date"
              className={inputCls}
              value={form.due_date}
              disabled={readOnly}
              onChange={(e) => set("due_date", e.target.value)}
            />
          </Field>

          <Field label="Currency">
            <input
              className={inputCls}
              value={form.currency}
              disabled={readOnly}
              onChange={(e) => set("currency", e.target.value.toUpperCase())}
            />
          </Field>

          <Field label="Country">
            <input
              className={inputCls}
              value={form.country}
              disabled={readOnly}
              onChange={(e) => set("country", e.target.value.toUpperCase())}
            />
          </Field>

          <Field label="Subtotal">
            <input
              inputMode="decimal"
              className={inputCls}
              value={form.subtotal}
              disabled={readOnly}
              onChange={(e) => set("subtotal", e.target.value)}
            />
          </Field>

          <Field label="Tax total">
            <input
              inputMode="decimal"
              className={inputCls}
              value={form.tax_total}
              disabled={readOnly}
              onChange={(e) => set("tax_total", e.target.value)}
            />
          </Field>

          <Field
            label="Total"
            hint={totalMismatch ? "≠ subtotal + tax" : undefined}
          >
            <input
              inputMode="decimal"
              className={`${inputCls} ${
                totalMismatch
                  ? "border-amber-400 focus:border-amber-500 focus:ring-amber-500/20"
                  : ""
              }`}
              value={form.total}
              disabled={readOnly}
              onChange={(e) => set("total", e.target.value)}
            />
          </Field>
        </div>

        {/* Line items */}
        <Card className="p-3">
          <SectionTitle
            action={
              !readOnly && (
                <Button
                  size="sm"
                  variant="ghost"
                  icon="plus"
                  onClick={() =>
                    set("line_items", [...form.line_items, { ...emptyLine }])
                  }
                >
                  Add line
                </Button>
              )
            }
          >
            Line items{" "}
            <span className="font-normal text-zinc-400">
              ({form.line_items.length})
            </span>
          </SectionTitle>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="text-left text-[11px] uppercase tracking-wide text-zinc-400">
                <tr>
                  <th className="px-2 py-1.5 font-medium">Description</th>
                  <th className="px-2 py-1.5 font-medium">HSN/SAC</th>
                  <th className="px-2 py-1.5 text-right font-medium">Qty</th>
                  <th className="px-2 py-1.5 text-right font-medium">Unit</th>
                  <th className="px-2 py-1.5 text-right font-medium">Amount</th>
                  <th className="px-2 py-1.5 text-right font-medium">Tax %</th>
                  <th className="w-8" />
                </tr>
              </thead>
              <tbody className="divide-y divide-zinc-100 dark:divide-zinc-800">
                {form.line_items.length === 0 && (
                  <tr>
                    <td
                      colSpan={7}
                      className="px-2 py-3 text-center text-xs text-zinc-400"
                    >
                      No line items.
                    </td>
                  </tr>
                )}
                {form.line_items.map((li, i) => (
                  <tr key={i}>
                    <td className="px-1 py-0.5">
                      <input
                        aria-label={`Line ${i + 1} description`}
                        className={cellCls}
                        value={li.description}
                        disabled={readOnly}
                        onChange={(e) =>
                          setLine(i, { description: e.target.value })
                        }
                      />
                    </td>
                    <td className="px-1 py-0.5">
                      <input
                        aria-label={`Line ${i + 1} HSN/SAC`}
                        className={cellCls}
                        value={li.hsn_sac}
                        disabled={readOnly}
                        onChange={(e) => setLine(i, { hsn_sac: e.target.value })}
                      />
                    </td>
                    <td className="px-1 py-0.5">
                      <input
                        aria-label={`Line ${i + 1} quantity`}
                        inputMode="decimal"
                        className={`${cellCls} text-right`}
                        value={li.quantity}
                        disabled={readOnly}
                        onChange={(e) => setLine(i, { quantity: e.target.value })}
                      />
                    </td>
                    <td className="px-1 py-0.5">
                      <input
                        aria-label={`Line ${i + 1} unit price`}
                        inputMode="decimal"
                        className={`${cellCls} text-right`}
                        value={li.unit_price}
                        disabled={readOnly}
                        onChange={(e) =>
                          setLine(i, { unit_price: e.target.value })
                        }
                      />
                    </td>
                    <td className="px-1 py-0.5">
                      <input
                        aria-label={`Line ${i + 1} amount`}
                        inputMode="decimal"
                        className={`${cellCls} text-right`}
                        value={li.amount}
                        disabled={readOnly}
                        onChange={(e) => setLine(i, { amount: e.target.value })}
                      />
                    </td>
                    <td className="px-1 py-0.5">
                      <input
                        aria-label={`Line ${i + 1} tax percent`}
                        inputMode="decimal"
                        className={`${cellCls} text-right`}
                        value={li.tax_rate}
                        disabled={readOnly}
                        onChange={(e) => setLine(i, { tax_rate: e.target.value })}
                      />
                    </td>
                    <td className="px-1 py-0.5 text-center">
                      {!readOnly && (
                        <button
                          type="button"
                          aria-label={`Remove line ${i + 1}`}
                          className="rounded p-1 text-zinc-400 transition hover:bg-red-50 hover:text-red-600 active:scale-90 dark:hover:bg-red-950/40"
                          onClick={() =>
                            set(
                              "line_items",
                              form.line_items.filter((_, idx) => idx !== i),
                            )
                          }
                        >
                          <Icon name="x" className="size-4" />
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
              {form.line_items.length > 0 && (
                <tfoot>
                  <tr className="border-t border-zinc-200 text-xs text-zinc-500 dark:border-zinc-700">
                    <td className="px-2 py-1.5" colSpan={4}>
                      Sum of lines
                    </td>
                    <td className="px-2 py-1.5 text-right tabular-nums">
                      {lineSum.toLocaleString("en-IN")}
                    </td>
                    <td colSpan={2} />
                  </tr>
                </tfoot>
              )}
            </table>
          </div>
        </Card>

        {/* Taxes */}
        <Card className="p-3">
          <SectionTitle
            action={
              !readOnly && (
                <Button
                  size="sm"
                  variant="ghost"
                  icon="plus"
                  onClick={() => set("taxes", [...form.taxes, { ...emptyTax }])}
                >
                  Add tax
                </Button>
              )
            }
          >
            Taxes{" "}
            <span className="font-normal text-zinc-400">
              ({form.taxes.length})
            </span>
          </SectionTitle>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="text-left text-[11px] uppercase tracking-wide text-zinc-400">
                <tr>
                  <th className="px-2 py-1.5 font-medium">Type</th>
                  <th className="px-2 py-1.5 text-right font-medium">Rate %</th>
                  <th className="px-2 py-1.5 text-right font-medium">Amount</th>
                  <th className="px-2 py-1.5 font-medium">Jurisdiction</th>
                  <th className="w-8" />
                </tr>
              </thead>
              <tbody className="divide-y divide-zinc-100 dark:divide-zinc-800">
                {form.taxes.length === 0 && (
                  <tr>
                    <td
                      colSpan={5}
                      className="px-2 py-3 text-center text-xs text-zinc-400"
                    >
                      No taxes.
                    </td>
                  </tr>
                )}
                {form.taxes.map((t, i) => (
                  <tr key={i}>
                    <td className="px-1 py-0.5">
                      <select
                        aria-label={`Tax ${i + 1} type`}
                        className={cellCls}
                        value={t.tax_type}
                        disabled={readOnly}
                        onChange={(e) =>
                          setTax(i, { tax_type: e.target.value as TaxType })
                        }
                      >
                        {TAX_TYPES.map((tt) => (
                          <option key={tt} value={tt}>
                            {tt}
                          </option>
                        ))}
                      </select>
                    </td>
                    <td className="px-1 py-0.5">
                      <input
                        aria-label={`Tax ${i + 1} rate percent`}
                        inputMode="decimal"
                        className={`${cellCls} text-right`}
                        value={t.rate}
                        disabled={readOnly}
                        onChange={(e) => setTax(i, { rate: e.target.value })}
                      />
                    </td>
                    <td className="px-1 py-0.5">
                      <input
                        aria-label={`Tax ${i + 1} amount`}
                        inputMode="decimal"
                        className={`${cellCls} text-right`}
                        value={t.amount}
                        disabled={readOnly}
                        onChange={(e) => setTax(i, { amount: e.target.value })}
                      />
                    </td>
                    <td className="px-1 py-0.5">
                      <input
                        aria-label={`Tax ${i + 1} jurisdiction`}
                        className={cellCls}
                        value={t.jurisdiction}
                        disabled={readOnly}
                        onChange={(e) =>
                          setTax(i, { jurisdiction: e.target.value })
                        }
                      />
                    </td>
                    <td className="px-1 py-0.5 text-center">
                      {!readOnly && (
                        <button
                          type="button"
                          aria-label={`Remove tax ${i + 1}`}
                          className="rounded p-1 text-zinc-400 transition hover:bg-red-50 hover:text-red-600 active:scale-90 dark:hover:bg-red-950/40"
                          onClick={() =>
                            set(
                              "taxes",
                              form.taxes.filter((_, idx) => idx !== i),
                            )
                          }
                        >
                          <Icon name="x" className="size-4" />
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
              {form.taxes.length > 0 && (
                <tfoot>
                  <tr className="border-t border-zinc-200 text-xs text-zinc-500 dark:border-zinc-700">
                    <td className="px-2 py-1.5" colSpan={2}>
                      Sum of taxes
                    </td>
                    <td className="px-2 py-1.5 text-right tabular-nums">
                      {taxSum.toLocaleString("en-IN")}
                    </td>
                    <td colSpan={2} />
                  </tr>
                </tfoot>
              )}
            </table>
          </div>
        </Card>

        {/* Additional / custom fields */}
        <Card className="p-3">
          <SectionTitle
            action={
              !readOnly && (
                <Button
                  size="sm"
                  variant="ghost"
                  icon="plus"
                  onClick={() =>
                    set("custom_fields", [
                      ...form.custom_fields,
                      { ...emptyCustom },
                    ])
                  }
                >
                  Add field
                </Button>
              )
            }
          >
            Additional fields{" "}
            <span className="font-normal text-zinc-400">
              ({form.custom_fields.length})
            </span>
          </SectionTitle>
          {form.custom_fields.length === 0 ? (
            <p className="px-1 py-2 text-xs text-zinc-400">
              Anything not on the receipt — PO number, GRN, project code,
              payment reference… These are included in the Excel export.
            </p>
          ) : (
            <div className="space-y-2">
              {form.custom_fields.map((c, i) => (
                <div key={i} className="flex items-center gap-2">
                  <input
                    aria-label={`Field ${i + 1} name`}
                    className={`${inputCls} sm:max-w-[40%]`}
                    placeholder="Field name"
                    value={c.label}
                    disabled={readOnly}
                    onChange={(e) => setCustom(i, { label: e.target.value })}
                  />
                  <input
                    aria-label={`Field ${i + 1} value`}
                    className={inputCls}
                    placeholder="Value"
                    value={c.value}
                    disabled={readOnly}
                    onChange={(e) => setCustom(i, { value: e.target.value })}
                  />
                  {!readOnly && (
                    <button
                      type="button"
                      aria-label={`Remove field ${i + 1}`}
                      className="shrink-0 rounded p-1.5 text-zinc-400 transition hover:bg-red-50 hover:text-red-600 active:scale-90 dark:hover:bg-red-950/40"
                      onClick={() =>
                        set(
                          "custom_fields",
                          form.custom_fields.filter((_, idx) => idx !== i),
                        )
                      }
                    >
                      <Icon name="x" className="size-4" />
                    </button>
                  )}
                </div>
              ))}
            </div>
          )}
        </Card>

        <Field label="Notes">
          <textarea
            className={`${inputCls} min-h-20`}
            value={form.notes}
            disabled={readOnly}
            onChange={(e) => set("notes", e.target.value)}
          />
        </Field>

        {feedback && (
          <p
            className={`text-sm ${
              feedback.kind === "ok" ? "text-emerald-600" : "text-red-600"
            }`}
            role={feedback.kind === "err" ? "alert" : undefined}
          >
            {feedback.text}
          </p>
        )}

        {locked && (
          <p className="rounded-lg border border-zinc-200 bg-zinc-50 px-3 py-2 text-sm text-zinc-500 dark:border-zinc-800 dark:bg-zinc-900">
            This record is {data.status}
            {data.status === "confirmed"
              ? " — ask an owner or accountant to change it."
              : " and can no longer be edited."}
          </p>
        )}

        {/* Sticky action bar */}
        {!readOnly && (
          <div className="fixed inset-x-0 bottom-0 z-20 border-t border-zinc-200 bg-white/95 px-4 py-3 backdrop-blur dark:border-zinc-800 dark:bg-zinc-950/95 lg:static lg:mt-2 lg:border-0 lg:bg-transparent lg:p-0 lg:backdrop-blur-none">
            <div className="mx-auto flex max-w-6xl items-center gap-3 lg:max-w-none">
              {isCreate ? (
                <Button
                  type="button"
                  variant="primary"
                  icon="check"
                  loading={pending}
                  onClick={runCreate}
                >
                  Create record
                </Button>
              ) : isReview ? (
                <>
                  <Button
                    type="button"
                    variant="secondary"
                    loading={pending}
                    onClick={() => runSave()}
                  >
                    Save draft
                  </Button>
                  {data.canManage && (
                    <Button
                      type="button"
                      variant="primary"
                      icon="check"
                      loading={pending}
                      onClick={() => runSave("confirm")}
                    >
                      Save &amp; confirm
                    </Button>
                  )}
                </>
              ) : (
                <>
                  <Button
                    type="button"
                    variant="primary"
                    icon="check"
                    loading={pending}
                    onClick={() => runSave("close")}
                  >
                    Save changes
                  </Button>
                  <Button
                    type="button"
                    variant="ghost"
                    onClick={cancelEdit}
                    disabled={pending}
                  >
                    Cancel
                  </Button>
                </>
              )}
            </div>
          </div>
        )}
      </form>
    </div>
  );
}
