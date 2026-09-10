"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { RECORD_TYPES, TAX_TYPES } from "@/lib/types";
import type { RecordType, TaxType } from "@/lib/types";
import type { RecordFormValues } from "./form-schema";
import { saveRecord, confirmRecord } from "./actions";

type Scalarish = string | number;

export interface ReviewFormData {
  expenseId: string;
  status: string;
  canManage: boolean;
  document: {
    mimeType: string | null;
    filename: string | null;
    signedUrl: string | null;
  };
  categories: {
    id: string;
    name: string;
    default_record_type: "invoice" | "expense";
  }[];
  vendors: { id: string; name: string }[];
  confidence: number | null;
  initial: {
    record_type: RecordType;
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
interface FormState {
  record_type: RecordType;
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
}

const s = (v: Scalarish): string => (v === "" || v == null ? "" : String(v));

const inputCls =
  "w-full rounded-md border border-zinc-300 bg-white px-2.5 py-1.5 text-sm outline-none focus:border-zinc-500 dark:border-zinc-700 dark:bg-zinc-900";
const cellCls =
  "w-full rounded border border-transparent bg-transparent px-1.5 py-1 text-sm outline-none focus:border-zinc-400 dark:focus:border-zinc-600";

function Field({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <label className="block">
      <span className="mb-1 block text-xs font-medium text-zinc-500">
        {label}
      </span>
      {children}
    </label>
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

export function ReviewForm({ data }: { data: ReviewFormData }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [feedback, setFeedback] = useState<
    { kind: "ok" | "err"; text: string } | null
  >(null);

  const readOnly = data.status !== "review";
  const [imgBroken, setImgBroken] = useState(false);

  const [form, setForm] = useState<FormState>(() => ({
    record_type: data.initial.record_type,
    vendor_name: data.initial.vendor_name,
    category_id: data.initial.category_id,
    new_category_name: data.initial.new_category_name,
    invoice_number: data.initial.invoice_number,
    invoice_date: data.initial.invoice_date,
    due_date: data.initial.due_date,
    currency: data.initial.currency,
    country: data.initial.country,
    subtotal: s(data.initial.subtotal),
    tax_total: s(data.initial.tax_total),
    total: s(data.initial.total),
    notes: data.initial.notes,
    line_items: data.initial.line_items.map((li) => ({
      description: li.description,
      hsn_sac: li.hsn_sac,
      quantity: s(li.quantity),
      unit_price: s(li.unit_price),
      amount: s(li.amount),
      tax_rate: s(li.tax_rate),
    })),
    taxes: data.initial.taxes.map((t) => ({
      tax_type: t.tax_type,
      rate: s(t.rate),
      amount: s(t.amount),
      jurisdiction: t.jurisdiction,
    })),
  }));

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

  const values: RecordFormValues = useMemo(
    () => ({
      record_type: form.record_type,
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
    }),
    [form],
  );

  function runSave(after?: () => void) {
    setFeedback(null);
    startTransition(async () => {
      const res = await saveRecord(data.expenseId, values);
      if (!res.ok) {
        setFeedback({ kind: "err", text: res.error ?? "Save failed." });
        return;
      }
      setFeedback({ kind: "ok", text: "Saved." });
      router.refresh();
      after?.();
    });
  }

  function runConfirm() {
    setFeedback(null);
    startTransition(async () => {
      const saveRes = await saveRecord(data.expenseId, values);
      if (!saveRes.ok) {
        setFeedback({
          kind: "err",
          text: saveRes.error ?? "Could not save before confirming.",
        });
        return;
      }
      const res = await confirmRecord(data.expenseId);
      if (!res.ok) {
        setFeedback({ kind: "err", text: res.error ?? "Confirm failed." });
        return;
      }
      setFeedback({ kind: "ok", text: "Confirmed — returning to Inbox…" });
      router.push("/inbox");
      router.refresh();
    });
  }

  const { mimeType, filename, signedUrl } = data.document;

  return (
    <div className="grid gap-6 lg:grid-cols-2">
      {/* Left: document preview */}
      <div className="lg:sticky lg:top-6 lg:self-start">
        <div className="rounded-xl border border-zinc-200 bg-white p-3 dark:border-zinc-800 dark:bg-zinc-900">
          {!signedUrl ? (
            <p className="p-6 text-center text-sm text-zinc-500">
              Preview unavailable.
            </p>
          ) : mimeType?.startsWith("image/") && !imgBroken ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={signedUrl}
              alt={filename ?? "Document"}
              onError={() => setImgBroken(true)}
              className="mx-auto max-h-[80vh] w-auto rounded-lg"
            />
          ) : mimeType?.startsWith("image/") && imgBroken ? (
            <p className="p-6 text-center text-sm text-zinc-500">
              This image can&rsquo;t be shown inline. Use{" "}
              <span className="font-medium">Open original</span> below.
            </p>
          ) : mimeType === "application/pdf" ? (
            <iframe
              src={signedUrl}
              title={filename ?? "Document"}
              className="h-[80vh] w-full rounded-lg"
            />
          ) : (
            <p className="p-6 text-center text-sm text-zinc-500">
              No inline preview for this file type.
            </p>
          )}
          {signedUrl && (
            <a
              href={signedUrl}
              target="_blank"
              rel="noreferrer"
              className="mt-2 block text-center text-xs font-medium text-zinc-500 underline underline-offset-2"
            >
              Open original{filename ? ` — ${filename}` : ""}
            </a>
          )}
        </div>
      </div>

      {/* Right: fields */}
      <form
        className="space-y-5"
        onSubmit={(e) => {
          e.preventDefault();
          if (!readOnly) runSave();
        }}
      >
        {readOnly && (
          <p className="rounded-lg border border-amber-300 bg-amber-50 px-3 py-2 text-sm text-amber-800 dark:border-amber-800/60 dark:bg-amber-950/40 dark:text-amber-300">
            This record is {data.status}. Fields are read-only.
          </p>
        )}
        {data.confidence != null && (
          <p className="text-xs text-zinc-500">
            Extraction confidence: {Math.round(data.confidence * 100)}%
          </p>
        )}

        {/* Record type toggle */}
        <div>
          <span className="mb-1 block text-xs font-medium text-zinc-500">
            Record type
          </span>
          <div className="inline-flex rounded-md border border-zinc-300 p-0.5 dark:border-zinc-700">
            {RECORD_TYPES.map((rt) => (
              <button
                key={rt}
                type="button"
                disabled={readOnly}
                onClick={() => set("record_type", rt)}
                className={`rounded px-3 py-1 text-sm capitalize transition ${
                  form.record_type === rt
                    ? "bg-zinc-900 text-white dark:bg-white dark:text-zinc-900"
                    : "text-zinc-600 dark:text-zinc-300"
                } disabled:opacity-60`}
              >
                {rt}
              </button>
            ))}
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

          <Field label="…or new category">
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
              onChange={(e) => set("currency", e.target.value)}
            />
          </Field>

          <Field label="Country">
            <input
              className={inputCls}
              value={form.country}
              disabled={readOnly}
              onChange={(e) => set("country", e.target.value)}
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

          <Field label="Total">
            <input
              inputMode="decimal"
              className={inputCls}
              value={form.total}
              disabled={readOnly}
              onChange={(e) => set("total", e.target.value)}
            />
          </Field>
        </div>

        {/* Line items */}
        <section>
          <div className="mb-1 flex items-center justify-between">
            <h3 className="text-sm font-semibold">Line items</h3>
            {!readOnly && (
              <button
                type="button"
                className="text-xs font-medium text-zinc-500 underline underline-offset-2"
                onClick={() =>
                  set("line_items", [...form.line_items, { ...emptyLine }])
                }
              >
                Add line
              </button>
            )}
          </div>
          <div className="overflow-x-auto rounded-lg border border-zinc-200 dark:border-zinc-800">
            <table className="w-full text-sm">
              <thead className="border-b border-zinc-200 text-left text-xs uppercase tracking-wide text-zinc-500 dark:border-zinc-800">
                <tr>
                  <th className="px-2 py-1.5">Description</th>
                  <th className="px-2 py-1.5">HSN/SAC</th>
                  <th className="px-2 py-1.5 text-right">Qty</th>
                  <th className="px-2 py-1.5 text-right">Unit price</th>
                  <th className="px-2 py-1.5 text-right">Amount</th>
                  <th className="px-2 py-1.5 text-right">Tax %</th>
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
                          aria-label="Remove line"
                          className="text-zinc-400 hover:text-red-600"
                          onClick={() =>
                            set(
                              "line_items",
                              form.line_items.filter((_, idx) => idx !== i),
                            )
                          }
                        >
                          ×
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>

        {/* Taxes */}
        <section>
          <div className="mb-1 flex items-center justify-between">
            <h3 className="text-sm font-semibold">Taxes</h3>
            {!readOnly && (
              <button
                type="button"
                className="text-xs font-medium text-zinc-500 underline underline-offset-2"
                onClick={() => set("taxes", [...form.taxes, { ...emptyTax }])}
              >
                Add tax
              </button>
            )}
          </div>
          <div className="overflow-x-auto rounded-lg border border-zinc-200 dark:border-zinc-800">
            <table className="w-full text-sm">
              <thead className="border-b border-zinc-200 text-left text-xs uppercase tracking-wide text-zinc-500 dark:border-zinc-800">
                <tr>
                  <th className="px-2 py-1.5">Type</th>
                  <th className="px-2 py-1.5 text-right">Rate %</th>
                  <th className="px-2 py-1.5 text-right">Amount</th>
                  <th className="px-2 py-1.5">Jurisdiction</th>
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
                          aria-label="Remove tax"
                          className="text-zinc-400 hover:text-red-600"
                          onClick={() =>
                            set(
                              "taxes",
                              form.taxes.filter((_, idx) => idx !== i),
                            )
                          }
                        >
                          ×
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>

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
          >
            {feedback.text}
          </p>
        )}

        {!readOnly && (
          <div className="flex items-center gap-3">
            <button
              type="submit"
              disabled={pending}
              className="rounded-md border border-zinc-300 px-4 py-1.5 text-sm font-medium hover:bg-zinc-100 disabled:opacity-60 dark:border-zinc-700 dark:hover:bg-zinc-800"
            >
              {pending ? "Saving…" : "Save"}
            </button>
            {data.canManage && (
              <button
                type="button"
                disabled={pending}
                onClick={runConfirm}
                className="rounded-md bg-zinc-900 px-4 py-1.5 text-sm font-medium text-white hover:bg-zinc-800 disabled:opacity-60 dark:bg-white dark:text-zinc-900 dark:hover:bg-zinc-200"
              >
                {pending ? "Working…" : "Save & confirm"}
              </button>
            )}
          </div>
        )}
      </form>
    </div>
  );
}
